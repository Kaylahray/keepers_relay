import { ccc } from '@ckb-ccc/core';

/** Match cell data, version 2. Same offsets as `sudden-death-common`. */
export const MATCH_DATA_LEN = 166;
export const MATCH_VERSION = 2;
/** Bid data: `version ‖ refund_after_ms u64 ‖ owner lock script`. */
export const BID_VERSION = 2;
export const BID_HEADER_LEN = 9;
/** An unused bid can be refunded this long after the deadline it was locked against. */
export const REFUND_GRACE_MS = 60 * 60 * 1000;
/** Steal witness (`input_type` of the match cell): `version ‖ tape`. */
export const RUN_VERSION = 1;
const SEED_DOMAIN = new TextEncoder().encode('crowns/run-seed/v1');

/** Time a steal removes. Round 1 cuts 10 minutes, then halves every two rounds, floor 72s. */
export function shrinkMs(round: number): number {
  const shift = Math.min(Math.floor(round / 2), 13);
  const cut = 600_000 >> shift;
  return cut < 72_000 ? 72_000 : cut;
}

export function shrunkDeadline(currentMs: number, round: number): number {
  const cut = shrinkMs(round);
  return currentMs <= cut ? 1_000 : currentMs - cut;
}

export function ckbHash(parts: Uint8Array[]): Uint8Array {
  return ccc.bytesFrom(ccc.hashCkb(...parts));
}

export function bytesToHex(bytes: Uint8Array): string {
  return ccc.hexFrom(bytes);
}

export function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(ccc.bytesFrom(hex));
}

function viewOf(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * The course `owner` runs in this match. Mirrors `run_seed` in the scripts: a run copied out of
 * someone else's pending steal is replayed on the copier's course and scores something else.
 */
export function runSeed(matchId: string | Uint8Array, ownerLockHash: string | Uint8Array): bigint {
  const id = typeof matchId === 'string' ? hexToBytes(matchId) : matchId;
  const owner = typeof ownerLockHash === 'string' ? hexToBytes(ownerLockHash) : ownerLockHash;
  return viewOf(ckbHash([SEED_DOMAIN, id, owner])).getBigUint64(0, true);
}

export function runWitness(tape: Uint8Array): Uint8Array {
  const raw = new Uint8Array(1 + tape.length);
  raw[0] = RUN_VERSION;
  raw.set(tape, 1);
  return raw;
}

/** The tape inside a steal's `input_type` witness, or null if it is not a v2 run. */
export function tapeFromWitness(raw: Uint8Array): Uint8Array | null {
  if (raw[0] !== RUN_VERSION) return null;
  return raw.slice(1);
}

export type MatchCell = {
  round: number;
  deadlineMs: bigint;
  fee: bigint;
  pot: bigint;
  king: Uint8Array;
  /** Data hash of the game script that scores runs. */
  game: Uint8Array;
  treasury: Uint8Array;
  bidCode: Uint8Array;
  /** The score a steal has to beat. Zero before the first crown. */
  kingScore: bigint;
};

function read32(data: Uint8Array, offset: number): Uint8Array {
  return data.slice(offset, offset + 32);
}

export function encodeMatchCell(cell: MatchCell): Uint8Array {
  const data = new Uint8Array(MATCH_DATA_LEN);
  const view = viewOf(data);
  data[0] = MATCH_VERSION;
  data[1] = 0;
  view.setUint32(2, cell.round, true);
  view.setBigUint64(6, cell.deadlineMs, true);
  view.setBigUint64(14, cell.fee, true);
  view.setBigUint64(22, cell.pot, true);
  data.set(cell.king, 30);
  data.set(cell.game, 62);
  data.set(cell.treasury, 94);
  data.set(cell.bidCode, 126);
  view.setBigUint64(158, cell.kingScore, true);
  return data;
}

export function decodeMatchCell(raw: Uint8Array): MatchCell {
  if (raw.length !== MATCH_DATA_LEN || raw[0] !== MATCH_VERSION) {
    throw new Error('This is not a version 2 match cell.');
  }
  const view = viewOf(raw);
  return {
    round: view.getUint32(2, true),
    deadlineMs: view.getBigUint64(6, true),
    fee: view.getBigUint64(14, true),
    pot: view.getBigUint64(22, true),
    king: read32(raw, 30),
    game: read32(raw, 62),
    treasury: read32(raw, 94),
    bidCode: read32(raw, 126),
    kingScore: view.getBigUint64(158, true),
  };
}

export function encodeBidData(owner: ccc.Script, refundAfterMs: bigint): Uint8Array {
  const script = owner.toBytes();
  const data = new Uint8Array(BID_HEADER_LEN + script.length);
  data[0] = BID_VERSION;
  viewOf(data).setBigUint64(1, refundAfterMs, true);
  data.set(script, BID_HEADER_LEN);
  return data;
}

export function decodeBidData(raw: Uint8Array): { owner: ccc.Script; refundAfterMs: bigint } {
  if (raw[0] !== BID_VERSION || raw.length <= BID_HEADER_LEN) {
    throw new Error('This is not a version 2 bid.');
  }
  return {
    refundAfterMs: viewOf(raw).getBigUint64(1, true),
    owner: ccc.Script.fromBytes(raw.slice(BID_HEADER_LEN)),
  };
}
