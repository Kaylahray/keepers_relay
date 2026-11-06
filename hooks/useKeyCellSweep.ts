'use client';

import { useEffect } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { returnKeyCell } from '@/lib/crown/chain';
import { dropOldRunKey, oldRunKeys, saveLapRun, savedLapRuns } from '@/lib/crown/my-laps';
import { loadCrown } from '@/lib/crown/rooms';
import { useWallet } from '@/hooks/useWallet';

/** A finished run's last lock lands within minutes, so a key cell still missing after this was already returned. */
const SETTLE_MS = 10 * 60_000;
const EVERY_MS = 3 * 60_000;

let sweeping = false;

/** A key cell under the wallet's minimum can never go back alone, so it counts as done instead of failing every sweep. */
const TOO_SMALL = 'too-small';

function failed(error: unknown): typeof TOO_SMALL | undefined {
  if (error instanceof Error && /Insufficient CKB/.test(error.message)) {
    console.info('Key cell is too small to return on its own; skipping it.');
    return TOO_SMALL;
  }
  console.warn('Key cell return failed:', error);
  return undefined;
}

/** Sends back key cells from runs that can no longer be played: replaced by a new entry, or in a crown whose clock ran out. */
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
        const now = Date.now();
        for (const key of oldRunKeys(address)) {
          const sent = await returnKeyCell(signer.client, key.session as ccc.Hex, owner).catch(failed);
          if (sent || (sent === null && now - key.since > SETTLE_MS)) dropOldRunKey(key.session);
        }
        for (const { roomId, run } of savedLapRuns(address)) {
          if (run.keyReturned) continue;
          const room = loadCrown(roomId);
          const endedAt = room?.status === 'settled' ? 0 : room?.deadlineAt;
          if (endedAt == null || endedAt > now) continue;
          const sent = await returnKeyCell(signer.client, run.session as ccc.Hex, owner).catch(failed);
          if (sent || (sent === null && now - endedAt > SETTLE_MS)) saveLapRun(roomId, address, { ...run, keyReturned: true });
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
