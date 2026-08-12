'use client';

import { useCallback } from 'react';
import { useSigner } from '@ckb-ccc/connector-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkUsernameAvailability,
  claimUsername,
  getUsernameByOwner,
  releaseUsername,
} from '@/lib/registry/username';
import type { Username, UsernameAvailability } from '@/lib/registry/types';
import { registryConfigured } from '@/lib/registry/config';
import { requestWalletRefresh } from '@/lib/wallet-refresh';

const usernameQueryKey = ['registry', 'username'] as const;

export function useUsername() {
  const signer = useSigner();
  const queryClient = useQueryClient();
  const queryKey = [...usernameQueryKey, signer ? 'connected' : 'disconnected'];

  const query = useQuery({
    queryKey,
    enabled: Boolean(signer) && registryConfigured(),
    queryFn: async (): Promise<Username | null> => {
      if (!signer) return null;
      return getUsernameByOwner(signer);
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (raw: string): Promise<Username> => {
      if (!registryConfigured()) {
        throw new Error(
          'On-chain username registry is not configured. Add NEXT_PUBLIC_USERNAME_* and NEXT_PUBLIC_CKB_JS_VM_* to .env.local.',
        );
      }
      if (!signer) {
        throw new Error('Connect your wallet to claim a username.');
      }
      return claimUsername(signer, raw);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      void queryClient.invalidateQueries({ queryKey: usernameQueryKey });
      requestWalletRefresh();
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (!signer) return;
      await releaseUsername(signer);
    },
    onSuccess: () => {
      queryClient.setQueryData(queryKey, null);
      void queryClient.invalidateQueries({ queryKey: usernameQueryKey });
      requestWalletRefresh();
    },
  });

  const claim = useCallback(
    async (raw: string): Promise<Username> => claimMutation.mutateAsync(raw),
    [claimMutation],
  );

  const release = useCallback(async () => {
    await releaseMutation.mutateAsync();
  }, [releaseMutation]);

  const checkAvailability = useCallback(
    async (raw: string): Promise<UsernameAvailability> => {
      if (!registryConfigured()) {
        return { ok: false, reason: 'wallet-required' };
      }
      return checkUsernameAvailability(raw, signer);
    },
    [signer],
  );

  return {
    username: query.data ?? null,
    isLoading: query.isLoading || query.isFetching,
    isClaiming: claimMutation.isPending || releaseMutation.isPending,
    claimError: claimMutation.error,
    refresh: query.refetch,
    claim,
    release,
    checkAvailability,
    hasWallet: !!signer,
    registryReady: registryConfigured(),
  };
}
