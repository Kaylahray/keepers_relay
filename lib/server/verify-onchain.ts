/**
 * Best-effort CKB RPC checks for join proofs (tx / live outpoint).
 */

import { getServerCkbClient } from '@/lib/ckb/server-client';
import { ApiError } from '@/lib/server/errors';

export type ChainOutPoint = { txHash: string; index: string };

function normalizeHex(hex: string): string {
  const t = hex.trim().toLowerCase();
  return t.startsWith('0x') ? t : `0x${t}`;
}

/**
 * When joinTxHash + participantOutPoint (or eventOutPoint) are present,
 * verify the tx / outpoint exists on RPC. Throws ApiError 400 on failure.
 * No chain fields → no-op (lobby join OK, onChainPending stays true upstream).
 */
export async function verifyJoinOnChain(input: {
  joinTxHash?: string | null;
  participantOutPoint?: ChainOutPoint | null;
  eventOutPoint?: ChainOutPoint | null;
}): Promise<void> {
  const joinTxHash = input.joinTxHash?.trim();
  const outPoint = input.participantOutPoint ?? input.eventOutPoint ?? null;
  if (!joinTxHash || !outPoint?.txHash) return;

  const client = getServerCkbClient();
  const txHash = normalizeHex(joinTxHash);
  const opTx = normalizeHex(outPoint.txHash);
  const index = outPoint.index?.trim() || '0x0';

  try {
    const tx = await client.getTransaction(txHash);
    if (!tx) {
      throw new ApiError('Join transaction not found on chain.', 400);
    }

    const live = await client.getCellLive(
      { txHash: opTx, index },
      false,
      true,
    );
    if (!live) {
      throw new ApiError('Join outpoint not found on chain.', 400);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const message = err instanceof Error ? err.message : 'On-chain verification failed.';
    throw new ApiError(message, 400);
  }
}
