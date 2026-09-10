import { ccc } from '@ckb-ccc/core';

/** Shared CKB byte helpers (type-id, hex) — not tied to any product script. */

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

/** Standard CKB type-id: blake2b(first input || output index LE). */
export function computeTypeId(firstInput: ccc.CellInput, outputIndex: number): Uint8Array {
  const indexBytes = new Uint8Array(8);
  new DataView(indexBytes.buffer).setBigUint64(0, BigInt(outputIndex), true);
  return blake2bCkb(new Uint8Array(firstInput.toBytes()), indexBytes);
}

/** Blake2b(prev || next) — used by artifact chaining in the UI. */
export function hashPair(a: Uint8Array, b: Uint8Array): Uint8Array {
  return blake2bCkb(a, b);
}
