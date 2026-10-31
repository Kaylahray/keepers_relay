import { ccc } from '@ckb-ccc/core';
import { MAX_WIND, type ShotRecord } from '@/lib/duel/artillery';

/** Duel cell and racer cell data, mirroring `duel-type` (scripts/sudden-death/contracts/duel-type). */

export const DUEL_VERSION = 1;
export const KIND_ARTILLERY = 1;
export const KIND_RACE = 2;
export const STATUS_OPEN = 0;
export const STATUS_LIVE = 1;
export type DuelKind = typeof KIND_ARTILLERY | typeof KIND_RACE;

const OFF_STAKE = 3;
const OFF_TIMER = 11;
const OFF_CHALLENGER = 19;
const OFF_OPPONENT = 51;
const OFF_KEY0 = 83;
const OFF_KEY1 = 115;
const OFF_GAME = 147;
const HEADER_LEN = 179;
const OFF_SEED_BLOCK = 179;
const OFF_SHOT_COUNT = 211;
const OFF_SHOTS = 212;
const OFF_SCORES = 179;
const OFF_SUBMITTED = 195;
export const ARTILLERY_START_LEN = OFF_SHOTS;
export const MAX_SHOTS = 30;
export const ARTILLERY_MAX_LEN = OFF_SHOTS + MAX_SHOTS * 3;
export const RACE_LEN = 196;
export const RACER_LEN = 42;
/** The race lasts at least five lap windows. */
export const MIN_RACE_MS = 5 * 3 * 60 * 1000;
/** A Pressure turn never gets shorter than this: a shot still needs a block to land in. */
export const PRESSURE_FLOOR_MS = 30_000;

/** An artillery timer: the first turn's ms (low 32 bits) and how many ms each later turn loses (high 32 bits). */
export function artilleryTimer(firstMs: number, shrinkMs = 0): bigint {
  return BigInt(firstMs) | (BigInt(shrinkMs) << 32n);
}

export function timerShrinkMs(timer: bigint): bigint {
  return timer >> 32n;
}

/** How long the turn of shot `count` may take, exactly as duel-type works it out. */
export function turnMs(timer: bigint, count: number): bigint {
  const first = timer & 0xffff_ffffn;
  const shrunk = first - timerShrinkMs(timer) * BigInt(count);
  const floor = first < BigInt(PRESSURE_FLOOR_MS) ? first : BigInt(PRESSURE_FLOOR_MS);
  return shrunk > floor ? shrunk : floor;
}

const WIND_DOMAIN = new TextEncoder().encode('crowns/duel-wind/v1');
const DUEL_DOMAIN = new TextEncoder().encode('crowns/duel/v1');
const ZERO = new Uint8Array(32);

export type DuelCell = {
  kind: DuelKind;
  status: typeof STATUS_OPEN | typeof STATUS_LIVE;
  stake: bigint;
  timerMs: bigint;
  challenger: Uint8Array;
  /** Zero until someone accepts an open challenge. */
  opponent: Uint8Array;
  key0: Uint8Array;
  key1: Uint8Array;
  game: Uint8Array;
  /** Artillery: the accept's block, recorded by the first shot. */
  seedBlock: Uint8Array;
  shots: ShotRecord[];
  /** Race: each side's submitted score, and who has submitted (bit 0 challenger, bit 1 opponent). */
  scores: [bigint, bigint];
  submitted: number;
};

function hash(parts: Uint8Array[]): Uint8Array {
  return ccc.bytesFrom(ccc.hashCkb(...parts));
}

function view(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

/** The wind a shot fires in, from the block the duel last landed in. Mirrors `wind_of`. */
export function duelWind(duelId: Uint8Array, block: Uint8Array): number {
  const value = view(hash([WIND_DOMAIN, duelId, block])).getUint32(0, true);
  return (value % (2 * MAX_WIND + 1)) - MAX_WIND;
}

/** The artillery seed, from the block the accept landed in. Mirrors `seed_of`. */
export function duelSeed(duelId: Uint8Array, block: Uint8Array): number {
  return view(hash([DUEL_DOMAIN, duelId, block])).getUint32(0, true);
}

export function encodeDuel(cell: DuelCell): Uint8Array {
  const length =
    cell.kind === KIND_RACE ? RACE_LEN : OFF_SHOTS + cell.shots.length * 3;
  const data = new Uint8Array(length);
  const dv = view(data);
  data[0] = DUEL_VERSION;
  data[1] = cell.kind;
  data[2] = cell.status;
  dv.setBigUint64(OFF_STAKE, cell.stake, true);
  dv.setBigUint64(OFF_TIMER, cell.timerMs, true);
  data.set(cell.challenger, OFF_CHALLENGER);
  data.set(cell.opponent, OFF_OPPONENT);
  data.set(cell.key0, OFF_KEY0);
  data.set(cell.key1, OFF_KEY1);
  data.set(cell.game, OFF_GAME);
  if (cell.kind === KIND_RACE) {
    dv.setBigUint64(OFF_SCORES, cell.scores[0], true);
    dv.setBigUint64(OFF_SCORES + 8, cell.scores[1], true);
    data[OFF_SUBMITTED] = cell.submitted;
  } else {
    data.set(cell.seedBlock, OFF_SEED_BLOCK);
    data[OFF_SHOT_COUNT] = cell.shots.length;
    cell.shots.forEach((shot, i) => {
      data[OFF_SHOTS + i * 3] = shot.angle;
      data[OFF_SHOTS + i * 3 + 1] = shot.power;
      data[OFF_SHOTS + i * 3 + 2] = shot.wind & 0xff;
    });
  }
  return data;
}

export function decodeDuel(raw: Uint8Array): DuelCell {
  if (raw.length < HEADER_LEN || raw[0] !== DUEL_VERSION) throw new Error('This is not a duel cell.');
  const dv = view(raw);
  const kind = raw[1] as DuelKind;
  const shots: ShotRecord[] = [];
  if (kind === KIND_ARTILLERY) {
    const count = raw[OFF_SHOT_COUNT] ?? 0;
    for (let i = 0; i < count; i += 1) {
      const at = OFF_SHOTS + i * 3;
      shots.push({ angle: raw[at]!, power: raw[at + 1]!, wind: (raw[at + 2]! << 24) >> 24 });
    }
  }
  return {
    kind,
    status: raw[2] as DuelCell['status'],
    stake: dv.getBigUint64(OFF_STAKE, true),
    timerMs: dv.getBigUint64(OFF_TIMER, true),
    challenger: raw.slice(OFF_CHALLENGER, OFF_CHALLENGER + 32),
    opponent: raw.slice(OFF_OPPONENT, OFF_OPPONENT + 32),
    key0: raw.slice(OFF_KEY0, OFF_KEY0 + 32),
    key1: raw.slice(OFF_KEY1, OFF_KEY1 + 32),
    game: raw.slice(OFF_GAME, OFF_GAME + 32),
    seedBlock: kind === KIND_ARTILLERY ? raw.slice(OFF_SEED_BLOCK, OFF_SEED_BLOCK + 32) : ZERO.slice(),
    shots,
    scores: kind === KIND_RACE ? [dv.getBigUint64(OFF_SCORES, true), dv.getBigUint64(OFF_SCORES + 8, true)] : [0n, 0n],
    submitted: kind === KIND_RACE ? raw[OFF_SUBMITTED]! : 0,
  };
}

/** A new challenge: open, nobody's key on side 1 yet, nothing played. */
export function newDuel(input: {
  kind: DuelKind;
  stake: bigint;
  timerMs: bigint;
  challenger: Uint8Array;
  opponent: Uint8Array | null;
  key0: Uint8Array;
  game: Uint8Array;
}): DuelCell {
  return {
    kind: input.kind,
    status: STATUS_OPEN,
    stake: input.stake,
    timerMs: input.timerMs,
    challenger: input.challenger,
    opponent: input.opponent ?? ZERO.slice(),
    key0: input.key0,
    key1: ZERO.slice(),
    game: input.game,
    seedBlock: ZERO.slice(),
    shots: [],
    scores: [0n, 0n],
    submitted: 0,
  };
}

export type Racer = { laps: number; lapStartMs: bigint; chain: Uint8Array };

export function encodeRacer(racer: Racer): Uint8Array {
  const data = new Uint8Array(RACER_LEN);
  data[0] = 1;
  data[1] = racer.laps;
  view(data).setBigUint64(2, racer.lapStartMs, true);
  data.set(racer.chain, 10);
  return data;
}

export function decodeRacer(raw: Uint8Array): Racer {
  if (raw.length !== RACER_LEN || raw[0] !== 1) throw new Error('This is not a racer cell.');
  return { laps: raw[1]!, lapStartMs: view(raw).getBigUint64(2, true), chain: raw.slice(10, 42) };
}
