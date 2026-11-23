import { ccc } from '@ckb-ccc/core';
import { rallyRelay } from '@/lib/registry/config';
import { joinMessage, PLAY_PATH, type JoinReply, type PlayMessage, type PlayReply, type RelayMessage } from '@/lib/rally/protocol';

/** Waits before trying a dropped WebSocket again: doubles each try, up to the last. */
const RECONNECT_MS = [250, 500, 1_000, 2_000, 4_000];
/** Signatures the relay may turn down in a row before the player hears about it. */
const MOVES_TROUBLE = 5;

/**
 * A phone's line to the rally relay: one event stream to listen on, a post to join, and a WebSocket
 * to steer and sign its moves on. The WebSocket keeps inputs in the order they were pressed. While it
 * is down, inputs go as posts; each input is numbered, so the relay drops one that came out of order
 * instead of taking it in the wrong place.
 */
export class RallyLink {
  private source: EventSource | null = null;
  private token: string | null = null;
  /** The relay's clock minus this phone's, from the last state message. */
  offsetMs = 0;
  /** The lock hash of the session key this phone joined with. */
  key: string | null = null;
  private play: WebSocket | null = null;
  /** The relay has taken this socket's hello. */
  private ready = false;
  private tries = 0;
  private closed = false;
  private seq = 0;
  // Posts are the fallback: one signature in flight at a time, and only the newest waits behind it.
  private signing = false;
  private nextMoves: { count: number; signature: string } | null = null;
  private failedMoves = 0;

  constructor(
    private readonly matchId: string,
    private readonly onMessage: (message: RelayMessage) => void,
    private readonly onTrouble: (problem: string | null) => void,
  ) {}

  listen() {
    this.source?.close();
    const source = new EventSource(`${rallyRelay.url}/stream?match=${encodeURIComponent(this.matchId)}`);
    source.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as RelayMessage;
      if (message.type === 'state') this.offsetMs = message.now - Date.now();
      this.onTrouble(null);
      this.onMessage(message);
    };
    // EventSource reconnects by itself; the relay sends everything again on reconnect.
    source.onerror = () => this.onTrouble('Lost the relay. Reconnecting…');
    this.source = source;
  }

  /** The relay's clock, as best this phone knows it. */
  now(): number {
    return Date.now() + this.offsetMs;
  }

  /** Proves this phone holds the session key of a car in the match. Returns that key's lock hash. */
  async join(client: ccc.Client, session: ccc.Hex): Promise<string> {
    const nonce = Date.now();
    const signer = new ccc.SignerCkbPrivateKey(client, session);
    const signature = await signer.signMessage(joinMessage(this.matchId, nonce));
    const reply = await this.post<JoinReply>('/join', { matchId: this.matchId, nonce, signature });
    this.token = reply.token;
    this.key = (await signer.getRecommendedAddressObj()).script.hash().toLowerCase();
    this.connect();
    return this.key;
  }

  input(tick: number, bits: number) {
    if (!this.token) return;
    this.seq += 1;
    if (this.say({ type: 'input', seq: this.seq, tick, bits })) return;
    void this.post('/input', { matchId: this.matchId, token: this.token, seq: this.seq, tick, bits }).catch(() => this.onTrouble('An input did not reach the relay.'));
  }

  /** Hands the relay this phone's signature over its car's first `count` events. */
  moves(count: number, signature: string) {
    if (!this.token) return;
    if (this.say({ type: 'moves', count, signature })) return;
    this.nextMoves = { count, signature };
    if (!this.signing) void this.sendMoves();
  }

  close() {
    this.closed = true;
    this.source?.close();
    this.source = null;
    this.play?.close();
    this.play = null;
    this.ready = false;
  }

  /** Asks the relay to close a lobby nobody joined, so the host's entry goes home now. */
  async closeLobby(): Promise<string | null> {
    const reply = await this.post<{ txHash: string | null }>('/close', { matchId: this.matchId });
    return reply.txHash;
  }

  /** Opens the WebSocket and says hello; opens it again after a drop until the link is closed. */
  private connect() {
    if (this.closed || !this.token || this.play) return;
    const socket = new WebSocket(`${rallyRelay.url.replace(/^http/, 'ws')}${PLAY_PATH}`);
    this.play = socket;
    socket.onopen = () => {
      this.tries = 0;
      socket.send(JSON.stringify({ type: 'hello', matchId: this.matchId, token: this.token! } satisfies PlayMessage));
    };
    socket.onmessage = (event) => {
      const reply = JSON.parse(event.data as string) as PlayReply;
      if (reply.type === 'ready') this.ready = true;
      else if (reply.type === 'moves') this.movesAnswered(reply.ok ? null : reply.error);
      else if (reply.type === 'error') console.warn('The relay turned down a message:', reply.error);
    };
    socket.onclose = () => {
      if (this.play !== socket) return;
      this.play = null;
      this.ready = false;
      if (this.closed) return;
      const wait = RECONNECT_MS[Math.min(this.tries, RECONNECT_MS.length - 1)]!;
      this.tries += 1;
      setTimeout(() => this.connect(), wait);
    };
  }

  /** Sends on the WebSocket once the relay has taken its hello; false if the caller should post instead. */
  private say(message: PlayMessage): boolean {
    if (!this.ready || this.play?.readyState !== WebSocket.OPEN) return false;
    this.play.send(JSON.stringify(message));
    return true;
  }

  // The relay keeps the last good signature and the next move signs again, so only a run of turned
  // down signatures is trouble.
  private movesAnswered(error: string | null) {
    if (error == null) {
      this.failedMoves = 0;
      return;
    }
    this.failedMoves += 1;
    console.warn('Moves signature not taken:', error);
    if (this.failedMoves >= MOVES_TROUBLE) this.onTrouble('Your moves did not reach the relay.');
  }

  private async sendMoves() {
    this.signing = true;
    while (this.nextMoves && this.token) {
      const { count, signature } = this.nextMoves;
      this.nextMoves = null;
      try {
        await this.post('/moves', { matchId: this.matchId, token: this.token, count, signature });
        this.movesAnswered(null);
      } catch (cause) {
        this.movesAnswered(cause instanceof Error ? cause.message : String(cause));
      }
    }
    this.signing = false;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${rallyRelay.url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (response.status === 204) return undefined as T;
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? 'The relay said no.');
    return data;
  }
}
