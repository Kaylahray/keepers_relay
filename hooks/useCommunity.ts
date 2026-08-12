'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { chainKeys, communityKeys } from '@/lib/queryClient';
import {
  acceptHandoff,
  createCommunity,
  declineHandoff,
  getCommunity,
  grantCommunityProof,
  joinCommunity,
  leaveCommunity,
  listCommunities,
  listHandoffs,
  requestHandoff,
} from '@/lib/api/communityApi';
import { useWallet } from '@/hooks/useWallet';
import { builderKeys } from '@/hooks/useBuilder';

export function useCommunitiesQuery() {
  const { address } = useWallet();
  return useQuery({
    queryKey: communityKeys.list(address),
    queryFn: () => listCommunities(address),
  });
}

export function useCommunityQuery(slug: string) {
  const { address } = useWallet();
  return useQuery({
    queryKey: communityKeys.detail(slug, address),
    queryFn: () => getCommunity(slug, address),
    enabled: Boolean(slug),
  });
}

export function useCreateCommunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCommunity,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useJoinCommunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, address }: { slug: string; address: string }) =>
      joinCommunity(slug, address),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useLeaveCommunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, address }: { slug: string; address: string }) =>
      leaveCommunity(slug, address),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useHandoffsQuery(journeyId: string | undefined) {
  return useQuery({
    queryKey: communityKeys.handoffs(journeyId ?? ''),
    queryFn: () => listHandoffs(journeyId!),
    enabled: Boolean(journeyId),
    refetchInterval: 30_000,
  });
}

export function useRequestHandoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: requestHandoff,
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: communityKeys.handoffs(vars.journeyId) });
    },
  });
}

export function useAcceptHandoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: acceptHandoff,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chainKeys.all });
      void qc.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useDeclineHandoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: declineHandoff,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useGrantCommunityProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: grantCommunityProof,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: communityKeys.all });
      void qc.invalidateQueries({ queryKey: builderKeys.roster });
    },
  });
}
