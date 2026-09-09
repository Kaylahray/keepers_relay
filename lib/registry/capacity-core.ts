import * as ccc from '@ckb-ccc/core';

export const SHANNONS_PER_CKB = BigInt(100_000_000);

export function computeMinCellCapacityCore(
  lock: ccc.Script,
  type: ccc.Script,
  outputData: Uint8Array,
): bigint {
  const cellOutput = ccc.CellOutput.from({
    capacity: ccc.numFrom(0),
    lock,
    type,
  });
  const occupied = BigInt(cellOutput.occupiedSize) + BigInt(outputData.length);
  return occupied * SHANNONS_PER_CKB;
}
