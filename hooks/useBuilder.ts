'use client';

import { useSigner } from '@ckb-ccc/connector-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkUsername,
  clearAvatarIfSpore,
  getBuilder,
  listBuilders,
  setBuilderAvatar,
  unlockBadge,
  upsertBuilder,
  getPassport,
} from '@/lib/api/keeperApi';
import { assumeKeeper } from '@/lib/api/chainApi';
import { chainKeys, keeperKeys } from '@/lib/queryClient';
import type { CharacterId } from '@/lib/characters';
import { useWallet } from '@/hooks/useWallet';
import { registryConfigured } from '@/lib/registry/config';
import { checkUsernameAvailability } from '@/lib/registry/username';
import { normalizeUsername } from '@/lib/rewards/milestones';

export const builderKeys = {
  roster: ['builders', 'roster'] as const,
  one: (address: string) => ['builders', address] as const,
};

export function useBuildersRoster() {
  return useQuery({
    queryKey: builderKeys.roster,
    queryFn: listBuilders,
    staleTime: 10_000,
  });
}

export function useMyBuilder() {
  const { address, isConnected } = useWallet();
  return useQuery({
    queryKey: builderKeys.one(address || 'anon'),
    queryFn: () => getBuilder(address),
    enabled: isConnected && !!address,
    staleTime: 5_000,
  });
}

export function useMyPassport() {
  const { address, isConnected } = useWallet();
  return useQuery({
    queryKey: [...keeperKeys.passport, address || 'anon'],
    queryFn: () => getPassport(address!),
    enabled: isConnected && Boolean(address),
    staleTime: 5_000,
  });
}

export function useUsernameCheck(username: string) {
  const { address } = useWallet();
  const signer = useSigner();
  return useQuery({
    queryKey: ['username-check', username, address, registryConfigured() ? 'chain' : 'soft'],
    queryFn: async () => {
      if (registryConfigured()) {
        const result = await checkUsernameAvailability(username, signer);
        if (result.ok) {
          return { username: normalizeUsername(username), available: true, reason: null };
        }
        const reason =
          result.reason === 'taken'
            ? 'That username is already taken on-chain.'
            : result.reason === 'format'
              ? 'Use 3–32 lowercase letters, numbers, or underscore.'
              : 'Connect your wallet to check this handle.';
        return {
          username: normalizeUsername(username),
          available: false,
          reason,
        };
      }
      return checkUsername(username, address || undefined);
    },
    enabled: username.trim().length >= 3,
    staleTime: 2_000,
  });
}

export function useUpsertBuilder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      address: string;
      username: string;
      displayName: string;
      characterId?: CharacterId | null;
      headline?: string;
      avatarSporeId?: string | null;
    }) => upsertBuilder(input),
    onSuccess: (builder) => {
      queryClient.setQueryData(builderKeys.one(builder.address), { builder });
      queryClient.invalidateQueries({ queryKey: builderKeys.roster });
      queryClient.invalidateQueries({ queryKey: keeperKeys.passport });
    },
  });
}

export function useSetAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { address: string; avatarSporeId: string | null }) =>
      setBuilderAvatar(input.address, input.avatarSporeId),
    onSuccess: (builder) => {
      queryClient.setQueryData(builderKeys.one(builder.address), { builder });
      queryClient.invalidateQueries({ queryKey: builderKeys.roster });
      queryClient.invalidateQueries({ queryKey: keeperKeys.passport });
    },
  });
}

export function useClearAvatarOnMelt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { address: string; sporeId: string }) =>
      clearAvatarIfSpore(input.address, input.sporeId),
    onSuccess: (builder) => {
      if (!builder) return;
      queryClient.setQueryData(builderKeys.one(builder.address), { builder });
    },
  });
}

export function useUnlockBadge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { address: string; badgeId: string }) =>
      unlockBadge(input.address, input.badgeId),
    onSuccess: (builder) => {
      queryClient.setQueryData(builderKeys.one(builder.address), { builder });
      queryClient.invalidateQueries({ queryKey: keeperKeys.passport });
    },
  });
}

export function useAssumeKeeper() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (address: string) => assumeKeeper(address),
    onSuccess: (chain) => {
      queryClient.setQueryData(chainKeys.detail(), chain);
    },
  });
}
