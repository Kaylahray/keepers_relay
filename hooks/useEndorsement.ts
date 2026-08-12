'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSigner } from '@ckb-ccc/connector-react';
import {
  endorseUser,
  listEndorsementsForUsername,
  type OnChainEndorsement,
} from '@/lib/registry/endorsement';
import { registryConfigured } from '@/lib/registry/config';
import { requestWalletRefresh } from '@/lib/wallet-refresh';
import { useUsername } from '@/hooks/useUsername';

export function useEndorsements(username: string | undefined) {
  return useQuery({
    queryKey: ['endorsements', username],
    enabled: Boolean(username) && registryConfigured(),
    queryFn: async (): Promise<OnChainEndorsement[]> => {
      if (!username) return [];
      return listEndorsementsForUsername(username);
    },
    staleTime: 15_000,
  });
}

export function useEndorseUser(subjectUsername: string) {
  const signer = useSigner();
  const queryClient = useQueryClient();
  const { username: myUsername } = useUsername();

  return useMutation({
    mutationFn: async (note: string) => {
      if (!signer) throw new Error('Connect your wallet to endorse.');
      if (!myUsername?.username) {
        throw new Error('Claim your own @handle before endorsing someone.');
      }
      return endorseUser({
        signer,
        subjectUsername,
        endorserUsername: myUsername.username,
        note,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['endorsements', subjectUsername] });
      requestWalletRefresh();
    },
  });
}
