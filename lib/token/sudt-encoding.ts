/** Pure sUDT amount encoding (no chain client). */

export function encodeSudtAmount(amount: bigint): Uint8Array {
  const out = new Uint8Array(16);
  let value = amount;
  const byteMask = BigInt(0xff);
  for (let i = 0; i < 16; i++) {
    out[i] = Number(value & byteMask);
    value >>= BigInt(8);
  }
  return out;
}

export function decodeSudtAmount(data: Uint8Array): bigint {
  if (data.length < 16) {
    throw new Error('Invalid sUDT amount data: expected at least 16 bytes.');
  }
  let value = BigInt(0);
  for (let i = 15; i >= 0; i--) {
    value = (value << BigInt(8)) + BigInt(data[i]);
  }
  return value;
}
