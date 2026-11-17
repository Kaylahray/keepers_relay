import { ccc } from '@ckb-ccc/core';
import { liveMatch, rallyGame } from '@/lib/registry/config';
import { winnersOf, type RallyEvent, type RallyRunner } from '@/lib/rally/rules';

/**
 * A finished race checked in the browser: the moves are read back out of the finish transaction and
 * replayed with the same rules the chain ran, so anyone can see the places come out the same and
 * that the car that won is the one that was paid.
 */

/**
 * Earlier rally game cells with the same rules as the one this site runs: the race plays out the same,
 * only how fast the game replays it changed. 0x151d…6b6c is the rounded-road game before the cheaper replay.
 * Games from before the rounded roads drive differently, so they are not here.
 */
const SAME_RULES = ['0x151d91491f9ddf21728ed1ac5bf879bdfbd176ed11b1ef23b4f72be369116b6c'];

/** Whether a race whose match named `game` can be replayed with this site's rules. */
export function playsByTheseRules(game: string): boolean {
  const hash = game.toLowerCase();
  return hash === rallyGame.codeHash.toLowerCase() || SAME_RULES.includes(hash);
}

/** The finish witness: `version 2 ‖ cars u8 ‖ per car: count u16 LE ‖ events ‖ 65-byte signature`. */
const RECORD_VERSION = 2;
const SIG_LEN = 65;
const EVENT_LEN = 3;

export type ReplayedCar = {
  /** 0 for first; cars over the line on the same tick share a place. */
  place: number;
  finished: boolean;
  /** The tick it crossed the line on, or null. */
  finishTick: number | null;
  shards: number;
  /** How many input changes its phone signed. */
  moves: number;
};

export type Replayed = {
  cars: ReplayedCar[];
  /** Car numbers (host first) the rules say won. Empty when nobody finished. */
  winners: number[];
  ticks: number;
};

/**
 * The race record exactly as the chain's game read it (`map ‖ cars ‖ per car: count ‖ events`), from
 * the finish transaction's witness. Null if the transaction isn't a race finish.
 */
export async function readRaceRecord(client: ccc.Client, txHash: string, map: number): Promise<Uint8Array | null> {
  const found = await client.getTransaction(txHash);
  if (!found) return null;
  const tx = found.transaction;
  const inputs = await Promise.all(tx.inputs.map((input) => client.getCell(input.previousOutput)));
  const at = inputs.findIndex((cell) => {
    const type = cell?.cellOutput.type;
    return Boolean(type && type.codeHash === liveMatch.codeHash && type.hashType === liveMatch.hashType && ccc.bytesFrom(type.args).length === 32);
  });
  const witness = at >= 0 ? tx.getWitnessArgs(at)?.inputType : undefined;
  return witness ? recordOf(witness, map) : null;
}

/** The race record from a finish witness (the signatures left out), or null if it isn't one. */
export function recordOf(witness: ccc.HexLike, map: number): Uint8Array | null {
  const raw = ccc.bytesFrom(witness);
  if (raw[0] !== RECORD_VERSION || raw.length < 2) return null;
  const cars = raw[1]!;
  const out: number[] = [map, cars];
  let offset = 2;
  for (let car = 0; car < cars; car += 1) {
    if (offset + 2 > raw.length) return null;
    const count = raw[offset]! | (raw[offset + 1]! << 8);
    const len = 2 + count * EVENT_LEN;
    if (offset + len + SIG_LEN > raw.length) return null;
    out.push(...raw.slice(offset, offset + len));
    offset += len + SIG_LEN;
  }
  return offset === raw.length ? Uint8Array.from(out) : null;
}

/** Each car's events from a race record (`map ‖ cars ‖ per car: count u16 LE ‖ tick u16 LE, bits u8 …`), to play it again. */
export function tapesOf(record: Uint8Array): RallyEvent[][] {
  const tapes: RallyEvent[][] = [];
  let offset = 2;
  for (let car = 0; car < (record[1] ?? 0); car += 1) {
    const count = record[offset]! | (record[offset + 1]! << 8);
    offset += 2;
    const events: RallyEvent[] = [];
    for (let i = 0; i < count; i += 1, offset += EVENT_LEN) events.push({ tick: record[offset]! | (record[offset + 1]! << 8), bits: record[offset + 2]! });
    tapes.push(events);
  }
  return tapes;
}

/** Replays a race record with the rules, as the chain does. Null if the rules refuse the record. */
export function replayRecord(runner: RallyRunner, record: Uint8Array): Replayed | null {
  const results = runner.replay(record);
  if (!results) return null;
  const moves: number[] = [];
  let offset = 2;
  for (let car = 0; car < results.length; car += 1) {
    const count = record[offset]! | (record[offset + 1]! << 8);
    moves.push(count);
    offset += 2 + count * EVENT_LEN;
  }
  return {
    cars: results.map((result, i) => {
      const car = runner.car(1, i);
      return { place: car.place, finished: car.finished != null, finishTick: car.finished, shards: car.shards, moves: moves[i] ?? 0 };
    }),
    winners: winnersOf(results),
    ticks: runner.tick(1),
  };
}
