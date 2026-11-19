/**
 * The Crown Rally relay. Runs each match's lobby, passes moves between the phones, keeps the race
 * clock, and at the end sends the finish on its own, so nobody has to be online for it. It never
 * decides who wins: the chain replays the record. Each phone signs its own car's moves as it drives,
 * and the chain pays only a winner whose moves that winner's key signed, so the relay can't make up
 * a win for anyone. With no winner it can only send every entry back.
 *
 * Run: `pnpm relay` with RALLY_RELAY_KEY (a private key only the relay uses, holding one plain cell of
 * at least 61 CKB) and the app's NEXT_PUBLIC_* chain settings. `pnpm relay --whoami` prints the lock
 * hash to put in NEXT_PUBLIC_RALLY_RELAY_LOCK_HASH and the address to fund.
 */

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ccc } from '@ckb-ccc/core';
import { getServerCkbClient } from '@/lib/ckb/server-client';
import { closeMatchTx, findMatch, matchFinishTx, plainCellOf, playersOf, racingSeats, signedRecord, type MatchSnapshot, type Player } from '@/lib/rally/chain';
import { movesSigner } from '@/lib/rally/moves';
import {
  COUNTDOWN_MS,
  joinMessage,
  lobbyEndsAt,
  MAX_AHEAD_TICKS,
  type CloseRequest,
  type InputRequest,
  type JoinRequest,
  type MovesRequest,
  type RallyPhase,
  type RelayMessage,
  type WireEvent,
} from '@/lib/rally/protocol';
import { rallyGame } from '@/lib/registry/config';
import { BOOST, BRAKE, LEFT, loadRally, playTo, RALLY, resultsOf, RIGHT, USE, winnersOf, type RallyEvent, type RallyRunner } from '@/lib/rally/rules';

const PORT = Number(process.env.PORT ?? 8787);
/** How long after the race the relay waits for the phones' last signatures before it settles. */
const SETTLE_GRACE_MS = 3_000;
/** How often a lobby reads its seats from the chain. */
const LOBBY_POLL_MS = 3_000;
/** A match the relay hasn't heard about for this long is forgotten. */
const FORGET_MS = 45 * 60 * 1000;

// A local devnet names its own system script cells (RALLY_DEVNET_SCRIPTS: a ccc scripts JSON file).
const devnetScripts = process.env.RALLY_DEVNET_SCRIPTS;
const client = devnetScripts
  ? new ccc.ClientPublicTestnet({ url: process.env.NEXT_PUBLIC_CKB_RPC_URL, scripts: JSON.parse(readFileSync(devnetScripts, 'utf8')) })
  : getServerCkbClient();
const relayKey = process.env.RALLY_RELAY_KEY?.trim();
if (!relayKey) {
  console.error('Set RALLY_RELAY_KEY: the private key the relay signs finishes with.');
  process.exit(1);
}
const relaySigner = new ccc.SignerCkbPrivateKey(client, relayKey);
const relayLock = (await relaySigner.getRecommendedAddressObj()).script;
const relayLockHash = relayLock.hash().toLowerCase();

if (process.argv.includes('--whoami')) {
  console.log(`NEXT_PUBLIC_RALLY_RELAY_LOCK_HASH=${relayLockHash}`);
  console.log(`Fund this address with at least 61 CKB: ${await relaySigner.getRecommendedAddress()}`);
  process.exit(0);
}

const wasm = readFileSync(path.join(process.cwd(), 'public/games/rally.wasm'));

/** A phone's signature, and the events it covers (the relay may change its last event after). */
type Signed = { events: RallyEvent[]; signature: ccc.Hex };

type Race = {
  matchId: string;
  snapshot: MatchSnapshot;
  runner: RallyRunner;
  /** Fixed when the countdown starts: each car's player, host first, and the seat cells that race. */
  cars: Player[];
  seats: ccc.Cell[];
  /** Token to session key lock hash. */
  tokens: Map<string, string>;
  joined: Set<string>;
  phase: RallyPhase;
  lobbyEndsAt: number | null;
  polledAt: number;
  polling: boolean;
  startAt: number | null;
  tapes: RallyEvent[][];
  held: number[];
  next: number[];
  /** Events taken since the last tick message. */
  fresh: WireEvent[];
  listeners: Set<http.ServerResponse>;
  /** Each car's latest signature from its phone. */
  signed: (Signed | null)[];
  /** When the race ended, so the last signatures have a moment to come in. */
  endedAt: number | null;
  settling: boolean;
  /** Gives the relay's cell back to the next match that needs it. */
  release: (() => void) | null;
  note?: string;
  txHash?: string;
  touchedAt: number;
};

const races = new Map<string, Race>();
const opening = new Map<string, Promise<Race>>();

// ---------------------------------------------------------------- the relay's cell

// Every finish and close spends the relay's one cell, so one match at a time holds it. The cell each
// send gives back is used straight away by the next, before it confirms.
let relayCell: ccc.Cell | null = null;
let relayTurn: Promise<void> = Promise.resolve();

function takeRelayTurn(): Promise<() => void> {
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  const before = relayTurn;
  relayTurn = before.then(() => mine);
  return before.then(() => release);
}

async function currentRelayCell(): Promise<ccc.Cell> {
  relayCell ??= await plainCellOf(client, relayLock);
  if (!relayCell) throw new Error('The relay has no cell to sign with. Fund it.');
  return relayCell;
}

/** Signs and sends a transaction holding the relay's cell, then keeps the cell it gives back. */
async function sendWithRelay(tx: ccc.Transaction): Promise<ccc.Hex> {
  try {
    const signed = await relaySigner.signOnlyTransaction(tx);
    const txHash = await client.sendTransaction(signed);
    const index = tx.outputs.findLastIndex((output) => output.lock.eq(relayLock));
    relayCell = ccc.Cell.from({ outPoint: { txHash, index }, cellOutput: tx.outputs[index]!, outputData: '0x' });
    return txHash;
  } catch (cause) {
    relayCell = null;
    throw cause;
  }
}

function giveBackTurn(race: Race) {
  race.release?.();
  race.release = null;
}

// ---------------------------------------------------------------- races

async function openRace(matchId: string): Promise<Race> {
  const id = matchId.toLowerCase();
  const known = races.get(id);
  if (known) return known;
  const running = opening.get(id);
  if (running) return running;
  const task = (async () => {
    const snapshot = await findMatch(client, id);
    if (!snapshot) throw new Error('No live match with that id.');
    if (!snapshot.landed) throw new Error('This match is still confirming.');
    if (snapshot.match.relay.toLowerCase() !== relayLockHash) throw new Error('This match names another relay.');
    const runner = await loadRally(wasm);
    runner.start(0, snapshot.match.map, snapshot.match.seats);
    const race: Race = {
      matchId: id,
      snapshot,
      runner,
      cars: [],
      seats: [],
      tokens: new Map(),
      joined: new Set(),
      phase: 'lobby',
      lobbyEndsAt: lobbyOf(snapshot),
      polledAt: Date.now(),
      polling: false,
      startAt: null,
      tapes: [],
      held: [],
      next: [],
      fresh: [],
      listeners: new Set(),
      signed: [],
      endedAt: null,
      settling: false,
      release: null,
      touchedAt: Date.now(),
    };
    races.set(id, race);
    return race;
  })().finally(() => opening.delete(id));
  opening.set(id, task);
  return task;
}

function lobbyOf(snapshot: MatchSnapshot): number {
  return lobbyEndsAt(
    Number(snapshot.landed!.landedMs),
    racingSeats(snapshot).map((seat) => Number(seat.landed!.landedMs)),
    snapshot.match.wait * 1000,
  );
}

/** Starts the countdown, unless the match is on a game this relay can no longer pay out on. */
function begin(race: Race, now: number) {
  // The match script can only call the game it was deployed with: a race on a replaced game could never pay out.
  if (race.snapshot.match.game.toLowerCase() !== rallyGame.codeHash.toLowerCase()) fail(race, new Error('This match was opened on an older version of the game, so it can’t be raced. Every entry can go home 10 minutes after the lobby’s wait.'));
  else startCountdown(race, now);
}

function send(response: http.ServerResponse, message: RelayMessage) {
  response.write(`data: ${JSON.stringify(message)}\n\n`);
}

function stateOf(race: Race): RelayMessage {
  return {
    type: 'state',
    phase: race.phase,
    lobbyEndsAt: race.lobbyEndsAt,
    startAt: race.startAt,
    now: Date.now(),
    map: race.snapshot.match.map,
    cars: race.cars.map((car) => car.key.toLowerCase()),
    joined: [...race.joined],
    note: race.note,
    txHash: race.txHash,
  };
}

function broadcast(race: Race, message: RelayMessage) {
  for (const listener of race.listeners) send(listener, message);
}

function carOf(race: Race, key: string): number {
  return race.cars.findIndex((car) => car.key.toLowerCase() === key);
}

/** Takes one input: on the tick asked for, or the next unplayed tick if it came late. */
function take(race: Race, car: number, tick: number, bits: number) {
  if (race.phase !== 'racing' && race.phase !== 'countdown') return;
  const events = race.tapes[car];
  if (!events) return;
  const played = race.runner.tick(0);
  const last = events.at(-1);
  let at = Math.max(Math.floor(tick), played);
  if (at > played + MAX_AHEAD_TICKS || at >= RALLY.MAX_TICKS) return;
  // A tick already holding an event, or before it, takes the place of that event.
  if (last && at <= last.tick && last.tick >= played) at = last.tick;
  if (last && at < last.tick) return;
  if (last && last.tick === at) {
    last.bits = bits;
  } else {
    if ((last?.bits ?? 0) === bits || events.length >= RALLY.MAX_EVENTS) return;
    events.push({ tick: at, bits });
  }
  race.fresh.push([car, at, bits]);
}

function startCountdown(race: Race, now: number) {
  race.seats = racingSeats(race.snapshot).map((seat) => seat.cell);
  race.cars = playersOf(race.snapshot);
  race.runner.start(0, race.snapshot.match.map, race.cars.length);
  race.tapes = race.cars.map(() => []);
  race.held = race.cars.map(() => 0);
  race.next = race.cars.map(() => 0);
  race.signed = race.cars.map(() => null);
  race.phase = 'countdown';
  race.startAt = now + COUNTDOWN_MS;
  // A car whose driver isn't here sits on the line until they come.
  race.cars.forEach((car, i) => {
    if (!race.joined.has(car.key.toLowerCase())) take(race, i, 0, BRAKE);
  });
  broadcast(race, stateOf(race));
}

/** Reads the lobby's seats again, and notices a match that ended some other way. */
async function pollLobby(race: Race) {
  if (race.polling) return;
  race.polling = true;
  try {
    const snapshot = await findMatch(client, race.matchId);
    if (race.phase !== 'lobby') return;
    if (!snapshot) {
      race.phase = 'done';
      race.note = 'This match has ended.';
      broadcast(race, stateOf(race));
      return;
    }
    race.snapshot = snapshot;
    race.lobbyEndsAt = lobbyOf(snapshot);
    broadcast(race, stateOf(race));
  } catch (cause) {
    console.error(`match ${race.matchId}: lobby read failed: ${cause instanceof Error ? cause.message : cause}`);
  } finally {
    race.polledAt = Date.now();
    race.polling = false;
  }
}

/** Nobody joined in time: the host's entry goes home. */
async function closeLobby(race: Race) {
  race.phase = 'settling';
  race.note = 'Nobody joined. Sending the host’s entry home…';
  broadcast(race, stateOf(race));
  race.release = await takeRelayTurn();
  try {
    const fresh = await findMatch(client, race.matchId);
    if (!fresh) throw new Error('This match has already ended.');
    if (racingSeats(fresh).length > 0) {
      // Someone joined at the last moment: race after all.
      race.snapshot = fresh;
      giveBackTurn(race);
      race.note = undefined;
      startCountdown(race, Date.now());
      return;
    }
    race.txHash = await sendWithRelay(await closeMatchTx(client, fresh, await currentRelayCell()));
    race.phase = 'done';
    race.note = 'Nobody joined, so the host’s entry went home.';
    broadcast(race, stateOf(race));
    console.log(`match ${race.matchId}: closed in ${race.txHash}`);
  } catch (cause) {
    fail(race, cause);
  } finally {
    giveBackTurn(race);
  }
}

/**
 * The record the finish carries, and the results it pays. Every winner's moves must be signed by
 * their own key. A winner whose phone dropped out before signing its last moves is judged on the
 * moves it did sign (or left on the line if it signed none), and the race is played again, until
 * every winner is signed. The relay can drop moves that way, but never add any.
 */
function sameEvents(a: RallyEvent[] | undefined, b: RallyEvent[]): boolean {
  return a != null && a.length === b.length && a.every((event, i) => event.tick === b[i]!.tick && event.bits === b[i]!.bits);
}

function settledRace(race: Race): { tapes: RallyEvent[][]; signatures: (ccc.Hex | null)[]; results: number[]; cut: number[] } {
  const tapes = race.tapes.map((events) => events.map((event) => ({ ...event })));
  const signedAll = (car: number) => sameEvents(race.signed[car]?.events, tapes[car]!);
  const cut: number[] = [];
  for (;;) {
    race.runner.start(1, race.snapshot.match.map, tapes.length);
    playTo(race.runner, 1, tapes, Number.MAX_SAFE_INTEGER);
    const results = resultsOf(race.runner, 1);
    const unsigned = winnersOf(results).filter((car) => !signedAll(car));
    if (unsigned.length === 0) {
      return { tapes, signatures: tapes.map((_, car) => (signedAll(car) ? race.signed[car]!.signature : null)), results, cut };
    }
    for (const car of unsigned) {
      const signed = race.signed[car];
      tapes[car] = signed ? signed.events.map((event) => ({ ...event })) : [{ tick: 0, bits: BRAKE }];
      cut.push(car);
    }
  }
}

/** The race is over: the relay sends the finish alone. */
async function settle(race: Race) {
  race.settling = true;
  race.release = await takeRelayTurn();
  try {
    const { tapes, signatures, results, cut } = settledRace(race);
    const record = signedRecord(tapes, signatures);
    const tx = await matchFinishTx(client, race.snapshot, { record, results, seats: race.seats, relayCell: await currentRelayCell() });
    race.txHash = await sendWithRelay(tx);
    race.phase = 'done';
    if (cut.length > 0) race.note = 'A winning phone dropped out before signing its last moves, so the race was settled on the moves it had signed.';
    giveBackTurn(race);
    broadcast(race, stateOf(race));
    const judged = cut.length > 0 ? ` (cars ${[...new Set(cut)].join(', ')} judged on their signed moves)` : '';
    console.log(`match ${race.matchId}: finished in ${race.txHash}${judged}`);
  } catch (cause) {
    fail(race, cause);
  }
}

function fail(race: Race, cause: unknown) {
  race.phase = 'failed';
  race.note = cause instanceof Error ? cause.message : String(cause);
  giveBackTurn(race);
  console.error(`match ${race.matchId}: ${race.note}`);
  broadcast(race, stateOf(race));
}

function tickRace(race: Race, now: number) {
  if (race.phase === 'lobby') {
    if (now - race.polledAt > LOBBY_POLL_MS) void pollLobby(race);
    // Only the clock starts a race, full or not, so every driver knows when it starts.
    if (now >= (race.lobbyEndsAt ?? 0)) {
      if (playersOf(race.snapshot).length < 2) void closeLobby(race);
      else begin(race, now);
    }
    return;
  }
  if (race.phase === 'settling' && race.endedAt != null && !race.settling && now - race.endedAt >= SETTLE_GRACE_MS) {
    void settle(race);
    return;
  }
  if (race.phase === 'countdown' && race.startAt != null && now >= race.startAt) {
    race.phase = 'racing';
    broadcast(race, stateOf(race));
  }
  if (race.phase !== 'racing' || race.startAt == null) return;
  const target = Math.floor((now - race.startAt) / RALLY.TICK_MS);
  const { runner } = race;
  while (runner.tick(0) < target && !runner.over(0)) {
    const tick = runner.tick(0);
    race.tapes.forEach((events, car) => {
      const at = race.next[car]!;
      if (events[at]?.tick === tick) {
        race.held[car] = events[at]!.bits;
        race.next[car] = at + 1;
      }
    });
    runner.step(0, race.held);
  }
  broadcast(race, { type: 'tick', t: runner.tick(0), ev: race.fresh });
  race.fresh = [];
  if (runner.over(0)) {
    race.phase = 'settling';
    race.endedAt = now;
    broadcast(race, stateOf(race));
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [id, race] of races) {
    if (now - race.touchedAt > FORGET_MS) {
      for (const listener of race.listeners) listener.end();
      races.delete(id);
      continue;
    }
    tickRace(race, now);
  }
}, RALLY.TICK_MS);

// Proxies and phones drop a quiet stream.
setInterval(() => {
  for (const race of races.values()) for (const listener of race.listeners) listener.write(': still here\n\n');
}, 15_000);

async function readJson<T>(request: http.IncomingMessage): Promise<T> {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20_000) throw new Error('Too big.');
  }
  return JSON.parse(body) as T;
}

function reply(response: http.ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function keyOf(race: Race, token: string): string {
  const key = race.tokens.get(token);
  if (key == null) throw new Error('Join the match first.');
  return key;
}

async function join(body: JoinRequest) {
  if (Math.abs(Date.now() - body.nonce) > 5 * 60_000) throw new Error('That join is too old. Check your phone’s clock.');
  const signature = { ...body.signature, signType: body.signature.signType as ccc.SignerSignType };
  // Only a session key: its identity is the public key its lock comes from.
  if (signature.signType !== ccc.SignerSignType.CkbSecp256k1) throw new Error('Join with the match’s session key.');
  if (!(await ccc.Signer.verifyMessage(joinMessage(body.matchId, body.nonce), signature))) throw new Error('That signature does not match.');
  const lock = (await new ccc.SignerCkbPublicKey(client, body.signature.identity).getRecommendedAddressObj()).script;
  const key = lock.hash().toLowerCase();
  const race = await openRace(body.matchId);
  // A seat that only just landed: read the lobby again before saying no.
  if (race.phase === 'lobby' && !playersOf(race.snapshot).some((player) => player.key.toLowerCase() === key)) await pollLobby(race);
  const inLobby = playersOf(race.snapshot).some((player) => player.key.toLowerCase() === key);
  if (race.cars.length > 0 ? carOf(race, key) < 0 : !inLobby) throw new Error('That key drives no car in this match.');
  const token = randomBytes(18).toString('base64url');
  race.tokens.set(token, key);
  race.joined.add(key);
  race.touchedAt = Date.now();
  broadcast(race, stateOf(race));
  return { token };
}

/** Keeps a phone's signature over its car's moves, if it is that car's key over the events the relay has. */
async function moves(body: MovesRequest) {
  const race = await openRace(body.matchId);
  const key = keyOf(race, body.token);
  const car = carOf(race, key);
  const events = race.tapes[car];
  if (!events) throw new Error('Your car is not racing.');
  const count = Math.floor(body.count);
  if (count < 0 || count > events.length || count < (race.signed[car]?.events.length ?? 0)) throw new Error('Those are not your moves.');
  const covered = events.slice(0, count).map((event) => ({ ...event }));
  if ((await movesSigner(client, race.matchId, covered, body.signature)) !== key) throw new Error('That signature does not match your moves.');
  race.signed[car] = { events: covered, signature: ccc.hexFrom(body.signature) };
  race.touchedAt = Date.now();
  return { ok: true };
}

async function close(body: CloseRequest) {
  const race = await openRace(body.matchId);
  if (race.phase !== 'lobby') throw new Error('This match is past its lobby.');
  if (playersOf(race.snapshot).length > 1) throw new Error('Someone has joined this match.');
  await closeLobby(race);
  // closeLobby moves the phase on; read it fresh.
  if ((race.phase as RallyPhase) === 'failed') throw new Error(race.note ?? 'The match could not be closed.');
  return { txHash: race.txHash ?? null };
}

const server = http.createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  const url = new URL(request.url ?? '/', 'http://relay');
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      reply(response, 200, { ok: true, races: races.size, relay: relayLockHash });
    } else if (request.method === 'GET' && url.pathname === '/stream') {
      const race = await openRace(url.searchParams.get('match') ?? '');
      race.touchedAt = Date.now();
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      race.listeners.add(response);
      request.on('close', () => race.listeners.delete(response));
      // Catch up: where things stand, and every event so far.
      send(response, stateOf(race));
      const all: WireEvent[] = race.tapes.flatMap((events, car) => events.map((event): WireEvent => [car, event.tick, event.bits]));
      send(response, { type: 'tick', t: race.runner.tick(0), ev: all.sort((a, b) => a[1] - b[1]) });
    } else if (request.method === 'POST' && url.pathname === '/join') {
      reply(response, 200, await join(await readJson<JoinRequest>(request)));
    } else if (request.method === 'POST' && url.pathname === '/input') {
      const body = await readJson<InputRequest>(request);
      const race = await openRace(body.matchId);
      take(race, carOf(race, keyOf(race, body.token)), body.tick, body.bits & (LEFT | RIGHT | BOOST | BRAKE | USE));
      race.touchedAt = Date.now();
      response.writeHead(204).end();
    } else if (request.method === 'POST' && url.pathname === '/moves') {
      reply(response, 200, await moves(await readJson<MovesRequest>(request)));
    } else if (request.method === 'POST' && url.pathname === '/close') {
      reply(response, 200, await close(await readJson<CloseRequest>(request)));
    } else {
      reply(response, 404, { error: 'Not here.' });
    }
  } catch (cause) {
    if (!response.headersSent) reply(response, 400, { error: cause instanceof Error ? cause.message : 'Bad request.' });
  }
});

server.listen(PORT, () => console.log(`Crowns relay on :${PORT}, signing as ${relayLockHash}`));
