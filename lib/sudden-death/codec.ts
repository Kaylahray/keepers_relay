import { ccc } from '@ckb-ccc/core';

/**
 * Match cell data, version 5. Same offsets as `sudden-death-common`. v5 keeps v4's layout and only
 * reckons land_by from the entry's last seal instead of from the entry itself.
 */
export const MATCH_DATA_LEN = 215;
export const MATCH_VERSION = 5;
/** Version 2 cells: the first 166 bytes of v4, with no postmark or work fields. Still readable for history. */
const V2_DATA_LEN = 166;
/** v4 only: a run counted if it landed within this long after the entry's block. Kept to verify old matches. */
export const RUN_WINDOW_MS = 10 * 60 * 1000;
/**
 * Each lap's window, from the block its road came from to the block its seal lands in. Waiting for
 * one lap's road never counts against it. A steal counts if it lands within one window of the last seal.
 */
export const LAP_WINDOW_MS = 3 * 60 * 1000;
/** Laps in a full run. Lap 1 is seeded by the entry's block, each later lap by the block where the
 * lap before it was sealed. */
export const LAPS = 5;
/** Proof of work a new crown asks of each entry: about 65,000 hashes, a second or two on a phone. */
export const DEFAULT_POW_BITS = 16;
/** 0.1 CKB: the most a transaction may take from an entry, or from the host's share, for the miner. */
export const MAX_TX_FEE = 10_000_000n;
/** 1 CKB: what a close may pay whoever sends it. */
export const CLOSER_REWARD = 100_000_000n;
/** How much less than their share the host may receive from a close: the fee and the closer's reward. */
export const HOST_ALLOWANCE = CLOSER_REWARD + MAX_TX_FEE;
/** Bid data: `version ‖ refund_after_ms u64 ‖ pow nonce u64 ‖ owner lock script`. */
/**
 * Bid data, version 5. The entry is also the player's run, one sealed lap at a time:
 * `version ‖ refund_after_ms ‖ pow nonce ‖ laps ‖ key lock hash ‖ lap start ms ‖ lap chain ‖ owner`.
 * The key lock is the player's key cell: CKB's built-in lock under a throwaway session key, spent by
 * each seal. Lap start is when the latest sealed lap's road appeared (v4 kept the entry's time there).
 */
export const BID_VERSION = 5;
export const BID_HEADER_LEN = 90;
const OFF_LAPS = 17;
const OFF_KEY = 18;
const OFF_LAP_START = 50;
const OFF_CHAIN = 58;
/** Older entries, still readable so they can be shown and returned: v2 had no nonce, v3 no run, v4 one window. */
const OLD_BID_HEADER_LEN: Record<number, number> = { 2: 9, 3: 17, 4: 90 };
/** Seal witness (`input_type` of the entry): `version ‖ moves hash`. The key cell's signature covers the rest. */
export const SEAL_VERSION = 1;
const LAP_DOMAIN = new TextEncoder().encode('crowns/lap/v1');
/** An unused bid can be refunded this long after the deadline it was locked against. */
export const REFUND_GRACE_MS = 60 * 60 * 1000;
/** Steal witness (`input_type` of the match cell): `version ‖ lap count ‖ per lap: block ‖ length ‖ tape`. */
export const RUN_VERSION = 2;
const SEED_DOMAIN = new TextEncoder().encode('crowns/run-seed/v2');
const V1_SEED_DOMAIN = new TextEncoder().encode('crowns/run-seed/v1');
const POW_DOMAIN = new TextEncoder().encode('crowns/entry-pow/v1');

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

function bytesOf(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? hexToBytes(value) : value;
}

/**
 * The course `owner` runs with the entry that landed in `entryBlock`. Mirrors `run_seed` in the
 * scripts: a run copied out of someone else's pending steal plays the copier's course, and nobody
 * sees their road before their entry lands, because nobody knows that block's hash in advance.
 */
export function runSeed(
  matchId: string | Uint8Array,
  ownerLockHash: string | Uint8Array,
  entryBlock: string | Uint8Array,
): bigint {
  return viewOf(ckbHash([SEED_DOMAIN, bytesOf(matchId), bytesOf(ownerLockHash), bytesOf(entryBlock)])).getBigUint64(0, true);
}

/** The course a version 2 match gave `owner`: no entry block. Only for replaying old matches. */
export function runSeedV1(matchId: string | Uint8Array, ownerLockHash: string | Uint8Array): bigint {
  return viewOf(ckbHash([V1_SEED_DOMAIN, bytesOf(matchId), bytesOf(ownerLockHash)])).getBigUint64(0, true);
}

/** When a steal must land to count, its entry's last lap sealed at `sealedMs`. Mirrors `land_by`. */
export function landBy(deadlineMs: bigint, sealedMs: bigint): bigint {
  const windowEnds = sealedMs + BigInt(LAP_WINDOW_MS);
  return deadlineMs < windowEnds ? deadlineMs : windowEnds;
}

/** v4's rule, for verifying old matches: one window from the entry's own block. */
export function landByV4(deadlineMs: bigint, entryMs: bigint): bigint {
  const windowEnds = entryMs + BigInt(RUN_WINDOW_MS);
  return deadlineMs < windowEnds ? deadlineMs : windowEnds;
}

/** Whether a lap whose road appeared at `lapStartMs` was sealed in time. Mirrors `lap_on_time`. */
export function lapOnTime(lapStartMs: bigint, sealedMs: bigint): boolean {
  return sealedMs <= lapStartMs + BigInt(LAP_WINDOW_MS);
}

/** Leading zero bits of an entry's proof of work. Mirrors `pow_bits` in the scripts. */
export function powBits(matchTypeHash: Uint8Array, owner: Uint8Array, firstInput: Uint8Array, nonce: bigint): number {
  const nonceBytes = new Uint8Array(8);
  viewOf(nonceBytes).setBigUint64(0, nonce, true);
  const digest = ckbHash([POW_DOMAIN, matchTypeHash, owner, firstInput, nonceBytes]);
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

/**
 * Finds a nonce that gives at least `bits` leading zero bits. Hashes in batches and yields between
 * them so the page keeps drawing; `onProgress` hears how many tries so far.
 */
export async function solvePow(
  matchTypeHash: Uint8Array,
  owner: Uint8Array,
  firstInput: Uint8Array,
  bits: number,
  onProgress?: (tries: number) => void,
): Promise<bigint> {
  const BATCH = 4_000;
  for (let nonce = 0n; ; ) {
    for (let i = 0; i < BATCH; i += 1, nonce += 1n) {
      if (powBits(matchTypeHash, owner, firstInput, nonce) >= bits) return nonce;
    }
    onProgress?.(Number(nonce));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** One sealed lap: the block that seeded its road, and its moves. */
export type SealedLap = { block: Uint8Array; tape: Uint8Array };

/** The steal witness for a lapped run. Mirrors `sealed_run` in the scripts. */
export function runWitness(laps: SealedLap[]): Uint8Array {
  const size = 2 + laps.reduce((sum, lap) => sum + 34 + lap.tape.length, 0);
  const raw = new Uint8Array(size);
  raw[0] = RUN_VERSION;
  raw[1] = laps.length;
  let at = 2;
  for (const lap of laps) {
    raw.set(lap.block, at);
    viewOf(raw).setUint16(at + 32, lap.tape.length, true);
    raw.set(lap.tape, at + 34);
    at += 34 + lap.tape.length;
  }
  return raw;
}

/** The laps in a steal's witness, or null for an unlapped (version 1) run. */
export function lapsFromWitness(raw: Uint8Array): SealedLap[] | null {
  if (raw[0] !== RUN_VERSION) return null;
  const laps: SealedLap[] = [];
  let at = 2;
  for (let i = 0; i < (raw[1] ?? 0); i += 1) {
    const len = viewOf(raw).getUint16(at + 32, true);
    laps.push({ block: raw.slice(at, at + 32), tape: raw.slice(at + 34, at + 34 + len) });
    at += 34 + len;
  }
  return laps;
}

/** The lap chain after one more lap. Mirrors `fold_lap`: order matters, so laps can't be swapped. */
export function foldLap(chain: Uint8Array, block: Uint8Array, movesHash: Uint8Array): Uint8Array {
  return ckbHash([LAP_DOMAIN, chain, block, movesHash]);
}



/** The tape inside a steal's `input_type` witness, or null if it is not a v2 run. */
export function tapeFromWitness(raw: Uint8Array): Uint8Array | null {
  // Version 1: the unlapped runs of version 2 crowns, still read for their history.
  if (raw[0] !== 1) return null;
  return raw.slice(1);
}

export type MatchCell = {
  /** 4, or 2 for a crown opened under the old rules. Encoding always writes 4. */
  version: number;
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
  /**
   * When the king's steal had to land to count: the deadline running when it was sent, or the end of
   * the king's run window if that came first. Zero before the first crown.
   */
  landByMs: bigint;
  /** The last king whose steal is proven to have landed on time. All zero if none. */
  certified: Uint8Array;
  certifiedScore: bigint;
  /** Leading zero bits each entry's proof of work needs. Fixed when the crown opens. */
  powBits: number;
};

const ZERO = new Uint8Array(32);

function isZero(bytes: Uint8Array): boolean {
  return bytes.every((byte) => byte === 0);
}

/**
 * The king and score that are certified once `cell`, which landed at `landedMs` (its block's
 * timestamp), is spent. Mirrors `certified_after` in the scripts: the king counts if their steal
 * landed by the deadline that was running when it was sent; otherwise the earlier one stands.
 */
export function certifiedAfter(cell: MatchCell, landedMs: bigint): { king: Uint8Array; score: bigint } {
  if (!isZero(cell.king) && landedMs <= cell.landByMs) {
    return { king: cell.king, score: cell.kingScore };
  }
  return { king: cell.certified, score: cell.certifiedScore };
}

/** Who the close pays the pot to, or null when nobody won on time and the host gets it all back. */
export function winnerOf(cell: MatchCell, landedMs: bigint): Uint8Array | null {
  const { king } = certifiedAfter(cell, landedMs);
  return isZero(king) ? null : king;
}

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
  view.setBigUint64(166, cell.landByMs, true);
  data.set(cell.certified, 174);
  view.setBigUint64(206, cell.certifiedScore, true);
  data[214] = cell.powBits;
  return data;
}

export function decodeMatchCell(raw: Uint8Array): MatchCell {
  const v4 = raw.length === MATCH_DATA_LEN && (raw[0] === 4 || raw[0] === MATCH_VERSION);
  const v2 = raw.length === V2_DATA_LEN && raw[0] === 2;
  if (!v4 && !v2) {
    throw new Error('This is not a Crowns match cell.');
  }
  const view = viewOf(raw);
  return {
    version: v4 ? raw[0]! : 2,
    round: view.getUint32(2, true),
    deadlineMs: view.getBigUint64(6, true),
    fee: view.getBigUint64(14, true),
    pot: view.getBigUint64(22, true),
    king: read32(raw, 30),
    game: read32(raw, 62),
    treasury: read32(raw, 94),
    bidCode: read32(raw, 126),
    kingScore: view.getBigUint64(158, true),
    landByMs: v4 ? view.getBigUint64(166, true) : 0n,
    certified: v4 ? read32(raw, 174) : ZERO.slice(),
    certifiedScore: v4 ? view.getBigUint64(206, true) : 0n,
    powBits: v4 ? raw[214]! : 0,
  };
}

/** A new entry: no laps sealed yet, and the lock hash of the key cell that will seal them. */
export function encodeBidData(owner: ccc.Script, refundAfterMs: bigint, nonce = 0n, key: Uint8Array = new Uint8Array(32)): Uint8Array {
  const script = owner.toBytes();
  const data = new Uint8Array(BID_HEADER_LEN + script.length);
  data[0] = BID_VERSION;
  viewOf(data).setBigUint64(1, refundAfterMs, true);
  viewOf(data).setBigUint64(9, nonce, true);
  data.set(key, OFF_KEY);
  data.set(script, BID_HEADER_LEN);
  return data;
}

/** An entry's data after one more lap is sealed, that lap's road having appeared at `lapStartMs`. */
export function sealedBidData(raw: Uint8Array, laps: number, lapStartMs: bigint, chain: Uint8Array): Uint8Array {
  const data = raw.slice();
  data[OFF_LAPS] = laps;
  viewOf(data).setBigUint64(OFF_LAP_START, lapStartMs, true);
  data.set(chain, OFF_CHAIN);
  return data;
}

/**
 * An entry's run so far. `lapStartMs` is when the latest sealed lap's road appeared; in a v4 entry the
 * same field held the entry's own time. Entries older than v4 read as having sealed nothing.
 */
export type EntryRun = { version: number; laps: number; key: Uint8Array; lapStartMs: bigint; chain: Uint8Array };

export function decodeEntryRun(raw: Uint8Array): EntryRun {
  const version = raw[0] ?? 0;
  if ((version !== BID_VERSION && version !== 4) || raw.length <= BID_HEADER_LEN) {
    return { version, laps: 0, key: new Uint8Array(32), lapStartMs: 0n, chain: new Uint8Array(32) };
  }
  return {
    version,
    laps: raw[OFF_LAPS]!,
    key: raw.slice(OFF_KEY, OFF_KEY + 32),
    lapStartMs: viewOf(raw).getBigUint64(OFF_LAP_START, true),
    chain: raw.slice(OFF_CHAIN, OFF_CHAIN + 32),
  };
}

export function decodeBidData(raw: Uint8Array): { owner: ccc.Script; refundAfterMs: bigint } {
  const header = raw[0] === BID_VERSION ? BID_HEADER_LEN : (OLD_BID_HEADER_LEN[raw[0] ?? 0] ?? 0);
  if (!header || raw.length <= header) {
    throw new Error('This is not a Crowns entry.');
  }
  return {
    refundAfterMs: viewOf(raw).getBigUint64(1, true),
    owner: ccc.Script.fromBytes(raw.slice(header)),
  };
}
