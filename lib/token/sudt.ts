'use client';

import { ccc } from '@ckb-ccc/connector-react';
import { getClient } from '@/lib/registry/client';
import { getSudtTypeScript } from '@/lib/registry/scripts';
import { decodeSudtAmount } from '@/lib/token/sudt-encoding';

export type SudtBalance = {
  amount: bigint;
  cellCount: number;
};

export type SudtCellWithAmount = {
  cell: ccc.Cell;
  amount: bigint;
};

export { decodeSudtAmount, encodeSudtAmount } from '@/lib/token/sudt-encoding';

export async function getSudtCellsByLock(
  lock: ccc.Script,
): Promise<SudtCellWithAmount[]> {
  const client = getClient();
  const type = getSudtTypeScript();
  const results: SudtCellWithAmount[] = [];

  for await (const cell of client.findCells(
    {
      script: type,
      scriptType: 'type',
      scriptSearchMode: 'exact',
      filter: { script: lock },
    },
    'asc',
    200,
  )) {
    const bytes = new Uint8Array(ccc.bytesFrom(cell.outputData));
    results.push({ cell, amount: decodeSudtAmount(bytes) });
  }

  return results;
}
