'use client';

import { useQuery } from '@tanstack/react-query';
import { getCkbClient } from '@/lib/ckb/client';
import { prizeStanding } from '@/lib/crown/chain';
import type { CrownRoom } from '@/lib/crown/rooms';
import { chainNames, nameOf } from '@/lib/registry/chain-names';

/** Who the prize goes to, read from the chain: `late` means the holder shown landed too late to win. */
export function usePrizeStanding(room: CrownRoom | null | undefined) {
  const point = room?.matchOutPoint?.txHash ?? null;
  const { data } = useQuery({
    queryKey: ['crown-prize', point],
    enabled: Boolean(room?.matchId && point && room.king && room.status === 'live'),
    retry: false,
    queryFn: async () => {
      const client = getCkbClient();
      const standing = await prizeStanding(client, room!);
      if (!standing) return null;
      const zero = standing.lockHash.replace(/^0x/, '').replace(/0/g, '') === '';
      const holder = zero ? null : nameOf(await chainNames(client, [standing.lockHash]), standing.lockHash);
      return { late: standing.late, holder, score: standing.score };
    },
  });
  return data ?? null;
}
