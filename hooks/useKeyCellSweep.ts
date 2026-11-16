'use client';

import { useEffect } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { useWallet } from '@/hooks/useWallet';
import { returnKeyCell } from '@/lib/chain/session';
import { findMatch } from '@/lib/rally/chain';
import { forgetPendingKey, forgetRallyKey, pendingKeys, savedRallyKeys } from '@/lib/rally/keys';

const EVERY_MS = 3 * 60_000;

let sweeping = false;

/** A key cell under the wallet's minimum can never go back alone, so it counts as done instead of failing every sweep. */
function failed(error: unknown): 'too-small' | undefined {
  if (error instanceof Error && /Insufficient CKB/.test(error.message)) {
    console.info('Key cell is too small to return on its own; skipping it.');
    return 'too-small';
  }
  console.warn('Key cell return failed:', error);
  return undefined;
}

/**
 * Sends back key cells nothing needs any more. Matches no longer make them (a session key only signs
 * moves now), but older matches did, and their cells wait under the browser's saved keys for this.
 */
export function useKeyCellSweep() {
  const signer = ccc.useSigner();
  const { address, isConnected } = useWallet();

  useEffect(() => {
    if (!signer || !isConnected || !address) return;
    const sweep = async () => {
      if (sweeping) return;
      sweeping = true;
      try {
        const owner = (await signer.getRecommendedAddressObj()).script;
        const saved = savedRallyKeys();
        const inUse = new Set(saved.map(([, secret]) => secret));
        for (const secret of pendingKeys()) {
          if (inUse.has(secret)) {
            forgetPendingKey(secret);
            continue;
          }
          // No key cell (null) is a key for a match that makes none: keep it, so the match page can
          // still find it if the wallet approved and the page never heard back. The list keeps 20.
          const sent = await returnKeyCell(signer.client, secret, owner).catch(failed);
          if (sent) forgetPendingKey(secret);
        }
        for (const [matchId, secret] of saved) {
          if (await findMatch(signer.client, matchId).catch(() => 'unknown' as const)) continue;
          // Not found can also mean just hosted and still landing, so a key with no key cell (null) stays.
          const sent = await returnKeyCell(signer.client, secret, owner).catch(failed);
          if (sent) forgetRallyKey(matchId);
        }
      } finally {
        sweeping = false;
      }
    };
    void sweep();
    const timer = window.setInterval(() => void sweep(), EVERY_MS);
    return () => window.clearInterval(timer);
  }, [signer, isConnected, address]);
}
