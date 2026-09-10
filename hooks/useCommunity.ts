'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { communityKeys } from '@/lib/queryClient';
import {
  createCommunity,
  getCommunity,
  grantCommunityPoints,
  joinCommunity,
  leaveCommunity,
  listCommunities,
} from '@/lib/api/communityApi';
import { useWallet } from '@/hooks/useWallet';

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
    mutationFn: ({
      slug,
      address,
      invitedByAddress,
    }: {
      slug: string;
      address: string;
      invitedByAddress?: string;
    }) => joinCommunity(slug, address, invitedByAddress),
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

export function useGrantCommunityPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: grantCommunityPoints,
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: communityKeys.all });
      void qc.invalidateQueries({
        queryKey: communityKeys.detail(vars.slug, vars.address),
      });
    },
  });
}
