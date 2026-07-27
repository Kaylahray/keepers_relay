'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { chainKeys } from '@/lib/queryClient';
import {
  fastForwardToEdge,
  getChain,
  passChain,
  resetChain,
} from '@/lib/api/chainApi';
import type { Chain } from '@/types/chain';

/** Read the current chain. Refetches on an interval so the death rule stays fresh. */
export function useChainQuery(): UseQueryResult<Chain, Error> {
  return useQuery({
    queryKey: chainKeys.detail(),
    queryFn: getChain,
    refetchInterval: 15 * 1000,
  });
}

/** Pass the object to a new owner (consume + create cell). */
export function usePassChain(): UseMutationResult<Chain, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipient: string) => passChain(recipient),
    onSuccess: (next) => {
      qc.setQueryData(chainKeys.detail(), next);
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
