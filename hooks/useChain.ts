'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useSigner } from '@ckb-ccc/connector-react';
import { chainKeys } from '@/lib/queryClient';
import {
  fastForwardToEdge,
  fundJourneyTreasury,
  getChain,
  launchJourney,
  listJourneys,
  passChain,
  resetChain,
  selectJourney,
} from '@/lib/api/chainApi';
import type { Chain, ChainMode } from '@/types/chain';
import { builderKeys } from '@/hooks/useBuilder';
import { keeperKeys } from '@/lib/queryClient';
import { chainCellConfigured } from '@/lib/registry/config';
import { handoffChainCell, mintChainCell } from '@/lib/registry/chain-cell';

/** Read the current chain. Poll lightly — countdown ticks locally every second. */
export function useChainQuery(): UseQueryResult<Chain, Error> {
  return useQuery({
    queryKey: chainKeys.detail(),
    queryFn: getChain,
    // Was 15s and felt like the whole page was “refreshing.”
    // Death rule still caught via countdown expiry refetch + occasional poll.
    refetchInterval: 60 * 1000,
    staleTime: 15 * 1000,
  });
}

export function useJourneysQuery() {
  return useQuery({
    queryKey: chainKeys.journeys(),
    queryFn: listJourneys,
    staleTime: 5_000,
  });
}

/** Pass the object to a new owner (consume + create cell). */
export function usePassChain(): UseMutationResult<
  Chain,
  Error,
  { recipient: string; city?: string; chain: Chain }
> {
  const qc = useQueryClient();
  const signer = useSigner();
  return useMutation({
    mutationFn: async ({ recipient, city, chain }) => {
      if (chain.cellOutPoint && chainCellConfigured()) {
        if (!signer) throw new Error('Connect your wallet to pass the Chain Cell.');
        const minted = await handoffChainCell(signer, {
          liveOutPoint: chain.cellOutPoint,
          recipient,
          creatorAddress: chain.creatorAddress,
          mode: chain.mode,
        });
        return passChain(minted.recipientLabel, city, {
          recipientAddress: minted.recipientAddress,
          cellOutPoint: minted.cellOutPoint,
          txHash: minted.txHash,
          expiresAt: minted.expiresAt,
        });
      }
      return passChain(recipient, city);
    },
    onSuccess: (next) => {
      qc.setQueryData(chainKeys.detail(), next);
      void qc.invalidateQueries({ queryKey: keeperKeys.artifact });
      void qc.invalidateQueries({ queryKey: chainKeys.journeys() });
    },
  });
}

/** Restart the whole experiment. */
export function useResetChain(): UseMutationResult<Chain, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resetChain(),
    onSuccess: (next) => {
      qc.setQueryData(chainKeys.detail(), next);
      void qc.invalidateQueries({ queryKey: chainKeys.journeys() });
      void qc.invalidateQueries({ queryKey: keeperKeys.artifact });
    },
  });
}

/** Demo helper — pull the expiry down to a few seconds. */
export function useFastForward(): UseMutationResult<Chain, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fastForwardToEdge(),
    onSuccess: (next) => {
      qc.setQueryData(chainKeys.detail(), next);
    },
  });
}

export function useLaunchJourney() {
  const qc = useQueryClient();
  const signer = useSigner();
  return useMutation({
    mutationFn: async (input: {
      address: string;
      communityId: string;
      creatureName: string;
      seedPrompt: string;
      mode: ChainMode;
      trophyGoal: number;
      windowHours?: number;
      initialProof?: number;
      rewardPoolNote?: string;
      coverImageUrl?: string;
    }) => {
      if (chainCellConfigured()) {
        if (!signer) throw new Error('Connect your wallet to mint the Chain Cell.');
        const minted = await mintChainCell(signer, {
          mode: input.mode,
          windowHours: input.windowHours ?? 24,
        });
        return launchJourney({
          ...input,
          windowHours: input.windowHours ?? 24,
          cellOutPoint: minted.cellOutPoint,
          onChainChainId: minted.chainId,
          genesisTxHash: minted.txHash,
          expiresAt: minted.expiresAt,
        });
      }
      return launchJourney(input);
    },
    onSuccess: (next) => {
      qc.setQueryData(chainKeys.detail(), next);
      void qc.invalidateQueries({ queryKey: chainKeys.journeys() });
      void qc.invalidateQueries({ queryKey: keeperKeys.artifact });
      void qc.invalidateQueries({ queryKey: builderKeys.roster });
    },
  });
}

export function useSelectJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (journeyId: string) => selectJourney(journeyId),
    onSuccess: (next) => {
      qc.setQueryData(chainKeys.detail(), next);
      void qc.invalidateQueries({ queryKey: chainKeys.journeys() });
      void qc.invalidateQueries({ queryKey: keeperKeys.artifact });
    },
  });
}

export function useFundJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      journeyId: string;
      address: string;
      amount: number;
      note?: string;
    }) => fundJourneyTreasury(input),
    onSuccess: (next) => {
      qc.setQueryData(chainKeys.detail(), next);
      void qc.invalidateQueries({ queryKey: chainKeys.journeys() });
      void qc.invalidateQueries({ queryKey: builderKeys.roster });
      void qc.invalidateQueries({ queryKey: ['builders'] });
    },
  });
}
