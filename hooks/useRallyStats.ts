'use client';

import { useQuery } from '@tanstack/react-query';
import { ccc } from '@ckb-ccc/core';
import { getRallyStats } from '@/lib/api/keeperApi';
import { getCkbClient } from '@/lib/ckb/client';
import type { PlayerTally } from '@/lib/rally/stats';

const CKB = 100_000_000n;

/** Every finished race and each wallet's tally, read from the chain by the server. */
export function useRallyStats() {
  return useQuery({ queryKey: ['rally-stats'], queryFn: getRallyStats, refetchInterval: 30_000, staleTime: 15_000 });
}

/** The lock hash of each address, lower case, for looking players up in the stats. */
export function useLockHashes(addresses: string[]) {
  return useQuery({
    queryKey: ['lock-hashes', addresses],
    enabled: addresses.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const client = getCkbClient();
      const out: Record<string, string> = {};
      for (const address of addresses) {
        try {
          out[address.toLowerCase()] = (await ccc.Address.fromString(address, client)).script.hash().toLowerCase();
        } catch {
          // Not an address on this network: no stats.
        }
      }
      return out;
    },
  });
}

export const NO_TALLY: PlayerTally = { played: 0, wins: 0, won: '0', shards: 0 };

/** Whole CKB, for showing. */
export function ckbWhole(shannons: string | bigint): number {
  return Number(BigInt(shannons) / CKB);
}
