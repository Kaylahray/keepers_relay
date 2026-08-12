'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateRelay,
  endorseCandidate,
  featureArtifact,
  getArtifact,
  getPassport,
  getQueue,
  getRelayAttempts,
  getRelayBoard,
  joinQueue,
  publishArtifact,
} from '@/lib/api/keeperApi';
import { keeperKeys, chainKeys } from '@/lib/queryClient';
import type { ArtifactKind } from '@/types/keeper';
import { useWallet } from '@/hooks/useWallet';

export { keeperKeys };

export function useRelayBoardQuery() {
  return useQuery({
    queryKey: keeperKeys.relayBoard,
    queryFn: getRelayBoard,
    staleTime: 10_000,
  });
}

export function usePassportQuery() {
  const { address } = useWallet();
  return useQuery({
    queryKey: [...keeperKeys.passport, address || 'guest'] as const,
    queryFn: () => getPassport(address || undefined),
    staleTime: 5_000,
  });
}

export function useRelayAttemptsQuery() {
  return useQuery({
    queryKey: keeperKeys.relayAttempts,
    queryFn: getRelayAttempts,
    staleTime: 5_000,
  });
}

export function useKeeperEcosystem() {
  const queryClient = useQueryClient();
  const { address } = useWallet();

  const artifact = useQuery({
    queryKey: keeperKeys.artifact,
    queryFn: getArtifact,
    staleTime: 10_000,
  });
  const relayBoard = useRelayBoardQuery();
  const attempts = useRelayAttemptsQuery();
  const queue = useQuery({ queryKey: keeperKeys.queue, queryFn: getQueue, staleTime: 10_000 });
  const passport = useQuery({
    queryKey: [...keeperKeys.passport, address || 'guest'],
    queryFn: () => getPassport(address || undefined),
    staleTime: 5_000,
  });

  const publish = useMutation({
    mutationFn: (input: { body: string; kind: ArtifactKind; place?: string }) =>
      publishArtifact(input),
    onSuccess: (next) => {
      queryClient.setQueryData(keeperKeys.artifact, next);
      queryClient.invalidateQueries({ queryKey: keeperKeys.passport });
      queryClient.invalidateQueries({ queryKey: chainKeys.detail() });
    },
  });

  const feature = useMutation({
    mutationFn: featureArtifact,
    onSuccess: (next) => queryClient.setQueryData(keeperKeys.artifact, next),
  });

  const activate = useMutation({
    mutationFn: activateRelay,
    onSuccess: (next) => queryClient.setQueryData(keeperKeys.relayBoard, next),
  });

  const join = useMutation({
    mutationFn: joinQueue,
    onSuccess: (next) => queryClient.setQueryData(keeperKeys.queue, next),
  });

  const endorse = useMutation({
    mutationFn: endorseCandidate,
    onSuccess: (next) => queryClient.setQueryData(keeperKeys.queue, next),
  });

  return { artifact, relayBoard, attempts, queue, passport, publish, feature, activate, join, endorse };
}
