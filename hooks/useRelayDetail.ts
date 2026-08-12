'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  claimRelayReward,
  getRelayDetail,
  startRelay,
  submitRelayProof,
} from '@/lib/api/keeperApi';
import { keeperKeys } from '@/lib/queryClient';
import { builderKeys } from '@/hooks/useBuilder';
import { useWallet } from '@/hooks/useWallet';
import type { RelayDetail } from '@/types/keeper';

/**
 * One Relay plus this user's attempt at it.
 *
 * While a proof sits in review the query polls, so the pending → verified
 * transition arrives without a manual refresh.
 */
export function useRelayDetail(relayId: string) {
  const queryClient = useQueryClient();
  const { address } = useWallet();
  const key = keeperKeys.relayDetail(relayId);

  const detail = useQuery({
    queryKey: key,
    queryFn: () => getRelayDetail(relayId),
    refetchInterval: (query) =>
      query.state.data?.attempt.status === 'submitted' ? 2_000 : false,
  });

  function cacheDetail(next: RelayDetail) {
    queryClient.setQueryData(key, next);
    queryClient.invalidateQueries({ queryKey: keeperKeys.relayAttempts });
  }

  const start = useMutation({
    mutationFn: () => startRelay(relayId),
    onSuccess: cacheDetail,
  });

  const submit = useMutation({
    mutationFn: (proof: string) => submitRelayProof({ relayId, proof }),
    onSuccess: cacheDetail,
  });

  const claim = useMutation({
    mutationFn: () => claimRelayReward(relayId, address || undefined),
    onSuccess: (next) => {
      cacheDetail(next.detail);
      queryClient.setQueryData(keeperKeys.relayBoard, next.board);
      queryClient.invalidateQueries({ queryKey: keeperKeys.passport });
      if (address) {
        queryClient.invalidateQueries({ queryKey: builderKeys.one(address) });
      }
    },
  });

  return { detail, start, submit, claim };
}
