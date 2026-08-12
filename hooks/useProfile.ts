'use client';

import { useCallback } from 'react';
import { useSigner } from '@ckb-ccc/connector-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  burnProfile,
  createProfile,
  getProfileByOwner,
  updateProfile,
} from '@/lib/registry/profile';
import type { Profile, StoredProfile } from '@/lib/registry/types';
import { registryConfigured } from '@/lib/registry/config';
import { requestWalletRefresh } from '@/lib/wallet-refresh';

const profileQueryKey = ['registry', 'profile'] as const;

export function useProfile() {
  const signer = useSigner();
  const queryClient = useQueryClient();
  const queryKey = [...profileQueryKey, signer ? 'connected' : 'disconnected'];

  const query = useQuery({
    queryKey,
    enabled: Boolean(signer) && registryConfigured(),
    queryFn: async (): Promise<StoredProfile | null> => {
      if (!signer) return null;
      return getProfileByOwner(signer);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (params: { data: Profile; username?: string }) => {
      if (!registryConfigured()) {
        throw new Error(
          'On-chain profile registry is not configured. Add NEXT_PUBLIC_PROFILE_* and NEXT_PUBLIC_CKB_JS_VM_* to .env.local.',
        );
      }
      if (!signer) {
        throw new Error('Connect your wallet to create a profile.');
      }
      return createProfile(signer, params.data, params.username);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      void queryClient.invalidateQueries({ queryKey: profileQueryKey });
      requestWalletRefresh();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (params: { data: Profile; username?: string }) => {
      if (!registryConfigured()) {
        throw new Error(
          'On-chain profile registry is not configured. Add NEXT_PUBLIC_PROFILE_* and NEXT_PUBLIC_CKB_JS_VM_* to .env.local.',
        );
      }
      if (!signer) {
        throw new Error('Connect your wallet to update your profile.');
      }
      return updateProfile(signer, params.data, params.username);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      void queryClient.invalidateQueries({ queryKey: profileQueryKey });
      requestWalletRefresh();
    },
  });

  const burnMutation = useMutation({
    mutationFn: async () => {
      if (!signer) return;
      await burnProfile(signer);
    },
    onSuccess: () => {
      queryClient.setQueryData(queryKey, null);
      void queryClient.invalidateQueries({ queryKey: profileQueryKey });
      requestWalletRefresh();
    },
  });

  const create = useCallback(
    async (data: Profile, username?: string) =>
      createMutation.mutateAsync({ data, username }),
    [createMutation],
  );

  const save = useCallback(
    async (data: Profile, username?: string) =>
      saveMutation.mutateAsync({ data, username }),
    [saveMutation],
  );

  const burn = useCallback(async () => {
    await burnMutation.mutateAsync();
  }, [burnMutation]);

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading || query.isFetching,
    isSaving:
      createMutation.isPending || saveMutation.isPending || burnMutation.isPending,
    saveError: createMutation.error ?? saveMutation.error,
    refresh: query.refetch,
    create,
    save,
    burn,
    registryReady: registryConfigured(),
  };
}
