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
 *
 * null means exactly one thing: the node looked and the cell is not live. That covers a cell
 * that was spent, one that never existed, and one whose transaction is still pending, because
 * the node only reports committed outputs. A failing request is not that answer. It throws, so a
 * rate-limited or unreachable RPC cannot pass for "the match cell has not arrived", which is
 * what the old catch-all turned it into.
 */
export async function readLiveCell(
  client: ccc.Client,
  point: { txHash: string; index: string },
): Promise<ccc.Cell | null> {
  const cell = await client.getCellLive({ txHash: point.txHash, index: point.index }, true);
  return cell ?? null;
}
