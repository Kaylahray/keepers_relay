import type { ChainMode } from '@/types/chain';

export const CHAIN_CELL_DATA_LEN = 116;
export const CHAIN_CELL_VERSION = 1;

export const ChainStatusCode = {
  Alive: 0,
  Dead: 1,
  Returned: 2,
} as const;

export const ChainModeCode = {
  Open: 0,
  ReturnHome: 1,
} as const;

export type ChainCellData = {
  status: number;
  mode: number;
  ownerCount: number;
  expiresAtMs: bigint;
  windowSeconds: number;
  chainId: Uint8Array;
  lineageRoot: Uint8Array;
  artifactRoot: Uint8Array;
};

function writeU32LE(out: Uint8Array, offset: number, value: number) {
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint32(offset, value >>> 0, true);
}

function writeU64LE(out: Uint8Array, offset: number, value: bigint) {
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setBigUint64(offset, value, true);
}

function readU32LE(data: Uint8Array, offset: number) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(
    offset,
    true,
  );
}

function readU64LE(data: Uint8Array, offset: number) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(
    offset,
    true,
  );
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

export function encodeChainCellData(input: {
  status?: number;
  mode: number;
  ownerCount: number;
  expiresAtMs: bigint;
  windowSeconds: number;
  chainId: Uint8Array;
  lineageRoot?: Uint8Array;
  artifactRoot?: Uint8Array;
}): Uint8Array {
  if (input.chainId.length !== 32) throw new Error('chainId must be 32 bytes');
  const out = new Uint8Array(CHAIN_CELL_DATA_LEN);
  out[0] = CHAIN_CELL_VERSION;
  out[1] = input.status ?? ChainStatusCode.Alive;
  out[2] = input.mode;
  writeU32LE(out, 4, input.ownerCount);
  writeU64LE(out, 8, input.expiresAtMs);
  writeU32LE(out, 16, input.windowSeconds);
  out.set(input.chainId, 20);
  out.set(input.lineageRoot ?? zeros32(), 52);
  out.set(input.artifactRoot ?? zeros32(), 84);
  return out;
}

export function decodeChainCellData(raw: Uint8Array): ChainCellData {
  if (raw.length !== CHAIN_CELL_DATA_LEN || raw[0] !== CHAIN_CELL_VERSION) {
    throw new Error('Not a v1 Chain Cell.');
  }
  return {
    status: raw[1] ?? 0,
    mode: raw[2] ?? 0,
    ownerCount: readU32LE(raw, 4),
    expiresAtMs: readU64LE(raw, 8),
    windowSeconds: readU32LE(raw, 16),
    chainId: raw.slice(20, 52),
    lineageRoot: raw.slice(52, 84),
    artifactRoot: raw.slice(84, 116),
  };
}

export function modeToCode(mode: ChainMode): number {
  return mode === 'return_home' ? ChainModeCode.ReturnHome : ChainModeCode.Open;
}
