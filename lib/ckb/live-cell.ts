import { ccc } from '@ckb-ccc/core';

/**
 * A cell read that tells the truth about liveness.
 *
 * `client.getCell` resolves an out point from the transaction that *created* it and
 * caches the result, so a cell a steal has already spent still comes back with full
 * data. Anything that asks "is the match cell still there?" with `getCell` gets a
 * permanent yes, and the room freezes on the round that cell was written in.
 *
 * `get_live_cell` is the only read that answers the question. It skips the cache on
 * the way in, so a cell that died since the last look reports dead.
 */
export async function readLiveCell(
  client: ccc.Client,
  point: { txHash: string; index: string },
): Promise<ccc.Cell | null> {
  try {
    const cell = await client.getCellLive({ txHash: point.txHash, index: point.index }, true);
    return cell ?? null;
  } catch {
    // Not indexed, not yet confirmed, or the node refused. Treat as "not live".
    return null;
  }
}
