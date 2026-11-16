import { ccc } from '@ckb-ccc/core';
import { rallyRelay } from '@/lib/registry/config';
import { joinMessage, type JoinReply, type RelayMessage } from '@/lib/rally/protocol';

/** A phone's line to the rally relay: one event stream to listen on, and posts to join, steer and sign its moves. */
export class RallyLink {
  private source: EventSource | null = null;
  private token: string | null = null;
  /** The relay's clock minus this phone's, from the last state message. */
  offsetMs = 0;
  /** The lock hash of the session key this phone joined with. */
  key: string | null = null;

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
    return this.key;
  }

  input(tick: number, bits: number) {
    if (!this.token) return;
    void this.post('/input', { matchId: this.matchId, token: this.token, tick, bits }).catch(() => this.onTrouble('An input did not reach the relay.'));
  }

  /** Hands the relay this phone's signature over its car's first `count` events. */
  moves(count: number, signature: string) {
    if (!this.token) return;
    void this.post('/moves', { matchId: this.matchId, token: this.token, count, signature }).catch(() => this.onTrouble('Your moves did not reach the relay.'));
  }

  close() {
    this.source?.close();
    this.source = null;
  }

  /** Asks the relay to close a lobby nobody joined, so the host's entry goes home now. */
  async closeLobby(): Promise<string | null> {
    const reply = await this.post<{ txHash: string | null }>('/close', { matchId: this.matchId });
    return reply.txHash;
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
