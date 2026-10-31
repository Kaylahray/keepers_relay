import { ccc } from '@ckb-ccc/core';

/** A cell read that tells the truth about liveness. */
export async function readLiveCell(
  client: ccc.Client,
  point: { txHash: string; index: string },
): Promise<ccc.Cell | null> {
  const cell = await client.getCellLive({ txHash: point.txHash, index: point.index }, true);
  return cell ?? null;
}
