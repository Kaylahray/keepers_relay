'use client';

import { useCallback } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rewardClaimsConfigured } from '@/lib/registry/config';
import {
  claimRewardFromTreasury,
  getRewardClaimsBySigner,
  rewardClaimQueryKeyForSigner,
  rewardClaimKeys,
  type RewardClaimCell,
} from '@/lib/rewards/onchain-claims';
import { requestWalletRefresh } from '@/lib/wallet-refresh';

export function useRewardClaims() {
  const signer = ccc.useSigner();
  const isConfigured = rewardClaimsConfigured();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: rewardClaimQueryKeyForSigner(signer),
    enabled: Boolean(signer) && isConfigured,
    queryFn: async () => {
      if (!signer) return [];
      return getRewardClaimsBySigner(signer);
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (claim: RewardClaimCell) => {
      if (!signer) {
        throw new Error('Connect your wallet to claim rewards.');
      }
      return claimRewardFromTreasury({ signer, claim });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: rewardClaimKeys.all });
      requestWalletRefresh();
    },
  });

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    isConfigured,
    claims: query.data ?? [],
    isLoading: query.isLoading || query.isFetching,
    isClaiming: claimMutation.isPending,
    claimReward: claimMutation.mutateAsync,
    refresh,
  };
}
