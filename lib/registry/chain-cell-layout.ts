import { ccc } from '@ckb-ccc/core';
import type { ChainMode, StakesConfig } from '@/types/chain';

/**
 * Chain Cell v2 data layout — must stay byte-for-byte in step with
 * `scripts/chain-cell/contracts/chain-cell-type/src/main.rs`.
 */
export const CHAIN_CELL_DATA_LEN = 168;
export const CHAIN_CELL_VERSION = 2;

export const ChainStatusCode = {
  Alive: 0,
  Dead: 1,
  Returned: 2,
} as const;

export const ChainModeCode = {
  Open: 0,
  ReturnHome: 1,
} as const;

export const CHAIN_FLAG_STAKES = 0b0000_0001;

/** `since` forms other than an absolute timestamp carry no time evidence. */
export const SINCE_ABSOLUTE_TIMESTAMP = 0x4000000000000000n;

const LINEAGE_SEED_TAG = new TextEncoder().encode('keepers-relay:lineage:v2');

export type ChainCellData = {
  status: number;
  mode: number;
  flags: number;
  ownerCount: number;
  expiresAtMs: bigint;
  windowSeconds: number;
  chainId: Uint8Array;
  lineageRoot: Uint8Array;
  artifactRoot: Uint8Array;
  creatorLockHash: Uint8Array;
  entryCkb: number;
  escalationBp: number;
  decayBp: number;
  floorSeconds: number;
  potAmount: bigint;
};

export type StakesOnChain = {
  entryCkb: number;
  escalationBp: number;
  decayBp: number;
  floorSeconds: number;
};

function view(data: Uint8Array) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function zeros32() {
  return new Uint8Array(32);
}

export function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToBytes(hex: string): Uint8Array {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (raw.length !== 64) throw new Error('Expected 32-byte hex.');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function blake2bCkb(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return new Uint8Array(ccc.bytesFrom(ccc.hashCkb(joined)));
}

/** The lineage value a freshly minted Cell must carry. */
export function genesisLineageRoot(
  chainId: Uint8Array,
  firstKeeperLockHash: Uint8Array,
): Uint8Array {
  return blake2bCkb(LINEAGE_SEED_TAG, chainId, firstKeeperLockHash);
}

/** Lineage after handing the Cell to `nextKeeperLockHash`. */
export function nextLineageRoot(
  current: Uint8Array,
  nextKeeperLockHash: Uint8Array,
): Uint8Array {
  return blake2bCkb(current, nextKeeperLockHash);
}

/** Artifact root after sealing `markHash` on top of the current root. */
export function nextArtifactRoot(current: Uint8Array, markHash: Uint8Array): Uint8Array {
  return blake2bCkb(current, markHash);
}

/**
 * Standard CKB type-id: blake2b(first input || output index). Every Cell's
 * identity is derived from the transaction that created it, so no second Cell
 * can ever claim it.
 */
export function computeTypeId(firstInput: ccc.CellInput, outputIndex: number): Uint8Array {
  const indexBytes = new Uint8Array(8);
  new DataView(indexBytes.buffer).setBigUint64(0, BigInt(outputIndex), true);
  return blake2bCkb(new Uint8Array(firstInput.toBytes()), indexBytes);
}

/** Build an absolute-timestamp `since` from a millisecond wall clock. */
export function sinceFromMs(ms: number | bigint): bigint {
  const seconds = BigInt(Math.floor(Number(ms) / 1000));
  return SINCE_ABSOLUTE_TIMESTAMP | seconds;
}

export function msFromSince(since: bigint): bigint {
  return (since & 0x00ffffffffffffffn) * 1000n;
}

/**
 * Window for the next Keeper. Mirrors `next_window_seconds` in the contract —
 * a stakes Cell shrinks geometrically toward its floor, everything else keeps
 * a constant window.
 */
export function nextWindowSeconds(data: {
  flags: number;
  windowSeconds: number;
  decayBp: number;
  floorSeconds: number;
  ownerCount: number;
}): number {
  if ((data.flags & CHAIN_FLAG_STAKES) === 0) return data.windowSeconds;
  const keep = BigInt(10_000 - data.decayBp);
  const floor = BigInt(data.floorSeconds);
  let window = BigInt(data.windowSeconds);
  const steps = Math.min(data.ownerCount, 1024);
  for (let i = 0; i < steps; i++) {
    if (window <= floor) break;
    window = (window * keep) / 10_000n;
  }
  if (window < floor) window = floor;
  return Number(window);
}

export function encodeChainCellData(input: {
  status?: number;
  mode: number;
  flags?: number;
  ownerCount: number;
  expiresAtMs: bigint;
  windowSeconds: number;
  chainId: Uint8Array;
  lineageRoot: Uint8Array;
  artifactRoot?: Uint8Array;
  creatorLockHash: Uint8Array;
  entryCkb?: number;
  escalationBp?: number;
  decayBp?: number;
  floorSeconds?: number;
  potAmount?: bigint;
}): Uint8Array {
  if (input.chainId.length !== 32) throw new Error('chainId must be 32 bytes');
  if (input.lineageRoot.length !== 32) throw new Error('lineageRoot must be 32 bytes');
  if (input.creatorLockHash.length !== 32) {
    throw new Error('creatorLockHash must be 32 bytes');
  }

  const out = new Uint8Array(CHAIN_CELL_DATA_LEN);
  const dv = view(out);
  out[0] = CHAIN_CELL_VERSION;
  out[1] = input.status ?? ChainStatusCode.Alive;
  out[2] = input.mode;
  out[3] = input.flags ?? 0;
  dv.setUint32(4, input.ownerCount >>> 0, true);
  dv.setBigUint64(8, input.expiresAtMs, true);
  dv.setUint32(16, input.windowSeconds >>> 0, true);
  out.set(input.chainId, 20);
  out.set(input.lineageRoot, 52);
  out.set(input.artifactRoot ?? zeros32(), 84);
  out.set(input.creatorLockHash, 116);
  dv.setUint32(148, (input.entryCkb ?? 0) >>> 0, true);
  dv.setUint16(152, (input.escalationBp ?? 0) & 0xffff, true);
  dv.setUint16(154, (input.decayBp ?? 0) & 0xffff, true);
  dv.setUint32(156, (input.floorSeconds ?? 0) >>> 0, true);
  dv.setBigUint64(160, input.potAmount ?? 0n, true);
  return out;
}

export function decodeChainCellData(raw: Uint8Array): ChainCellData {
  if (raw.length !== CHAIN_CELL_DATA_LEN || raw[0] !== CHAIN_CELL_VERSION) {
    throw new Error('Not a v2 Chain Cell.');
  }
  const dv = view(raw);
  return {
    status: raw[1] ?? 0,
    mode: raw[2] ?? 0,
    flags: raw[3] ?? 0,
    ownerCount: dv.getUint32(4, true),
    expiresAtMs: dv.getBigUint64(8, true),
    windowSeconds: dv.getUint32(16, true),
    chainId: raw.slice(20, 52),
    lineageRoot: raw.slice(52, 84),
    artifactRoot: raw.slice(84, 116),
    creatorLockHash: raw.slice(116, 148),
    entryCkb: dv.getUint32(148, true),
    escalationBp: dv.getUint16(152, true),
    decayBp: dv.getUint16(154, true),
    floorSeconds: dv.getUint32(156, true),
    potAmount: dv.getBigUint64(160, true),
  };
}

/**
 * Translate the percent-and-hours stakes config the app works in into the
 * basis-points-and-seconds form the Cell stores.
 *
 * The floor is clamped to the base window: the contract rejects a floor longer
 * than the window it is supposed to be a floor for, and the launch form lets
 * you pick a 24h floor on a 12h window.
 */
export function toOnChainStakes(
  stakes: StakesConfig,
  windowSeconds: number,
): StakesOnChain {
  const floorSeconds = Math.round(stakes.floorHours * 3600);
  return {
    entryCkb: Math.max(1, Math.round(stakes.entryCkb)),
    escalationBp: Math.round(stakes.escalationPct * 100),
    decayBp: Math.max(1, Math.round(stakes.decayPct * 100)),
    floorSeconds: Math.min(Math.max(60, floorSeconds), windowSeconds),
  };
}

export function modeToCode(mode: ChainMode): number {
  return mode === 'return_home' ? ChainModeCode.ReturnHome : ChainModeCode.Open;
}
