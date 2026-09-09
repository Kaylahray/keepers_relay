'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDraftMark,
  getHomeFeed,
  markHomeNoticesRead,
  nominateNextKeeper,
  rescueChain,
  saveDraftMark,
} from '@/lib/api/homeApi';
import { chainKeys, communityKeys, keeperKeys } from '@/lib/queryClient';
import { useWallet } from '@/hooks/useWallet';
import type { ArtifactKind } from '@/types/keeper';

export function useHomeFeed() {
  const { address } = useWallet();
  return useQuery({
    queryKey: keeperKeys.home(address),
    queryFn: () => getHomeFeed(address!),
    enabled: Boolean(address),
    refetchInterval: 20_000,
  });
}

export function useMarkHomeNoticesRead() {
  const qc = useQueryClient();
  const { address } = useWallet();
  return useMutation({
    mutationFn: () => markHomeNoticesRead(address!),
    onSuccess: (feed) => {
      if (address) qc.setQueryData(keeperKeys.home(address), feed);
    },
  });
}

export function useDraftMark(journeyId: string | undefined) {
  const { address } = useWallet();
  return useQuery({
    queryKey: keeperKeys.draft(address ?? '', journeyId ?? ''),
    queryFn: () => getDraftMark(address!, journeyId!),
    enabled: Boolean(address && journeyId),
  });
}

export function useSaveDraftMark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      address: string;
      journeyId: string;
      body?: string;
      kind?: ArtifactKind;
      place?: string;
      imageUrl?: string;
    }) => saveDraftMark(input),
    onSuccess: (draft) => {
      qc.setQueryData(keeperKeys.draft(draft.address, draft.journeyId), draft);
      void qc.invalidateQueries({ queryKey: keeperKeys.home(draft.address) });
    },
  });
}

export function useNominateNextKeeper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: nominateNextKeeper,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chainKeys.all });
      void qc.invalidateQueries({ queryKey: communityKeys.all });
      void qc.invalidateQueries({ queryKey: ['keeper', 'home'] });
    },
  });
}

export function useRescueChain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rescueChain,
    onSuccess: (next) => {
      qc.setQueryData(chainKeys.detail(), next);
      void qc.invalidateQueries({ queryKey: chainKeys.journeys() });
      void qc.invalidateQueries({ queryKey: communityKeys.all });
      void qc.invalidateQueries({ queryKey: ['keeper', 'home'] });
      void qc.invalidateQueries({ queryKey: ['builders'] });
    },
  });
}
