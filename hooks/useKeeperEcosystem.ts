'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateRelay,
  completeRelay,
  endorseCandidate,
  featureArtifact,
  getArtifact,
  getPassport,
  getQueue,
  getRelayBoard,
  joinQueue,
  publishArtifact,
} from '@/lib/api/keeperApi';
import type { ArtifactKind } from '@/types/keeper';

export const keeperKeys = {
  artifact: ['keeper', 'artifact'] as const,
  relayBoard: ['keeper', 'relay-board'] as const,
  queue: ['keeper', 'queue'] as const,
  passport: ['keeper', 'passport'] as const,
};

export function useKeeperEcosystem() {
  const queryClient = useQueryClient();
  const artifact = useQuery({ queryKey: keeperKeys.artifact, queryFn: getArtifact, staleTime: 10_000 });
  const relayBoard = useQuery({ queryKey: keeperKeys.relayBoard, queryFn: getRelayBoard, staleTime: 10_000 });
  const queue = useQuery({ queryKey: keeperKeys.queue, queryFn: getQueue, staleTime: 10_000 });
  const passport = useQuery({ queryKey: keeperKeys.passport, queryFn: getPassport, staleTime: 10_000 });

  const publish = useMutation({
    mutationFn: (input: { body: string; kind: ArtifactKind }) => publishArtifact(input),
    onSuccess: (next) => {
      queryClient.setQueryData(keeperKeys.artifact, next);
      queryClient.invalidateQueries({ queryKey: keeperKeys.passport });
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

  const complete = useMutation({
    mutationFn: completeRelay,
    onSuccess: (next) => {
      queryClient.setQueryData(keeperKeys.relayBoard, next.board);
      queryClient.setQueryData(keeperKeys.passport, next.passport);
    },
  });

  const join = useMutation({
    mutationFn: joinQueue,
    onSuccess: (next) => queryClient.setQueryData(keeperKeys.queue, next),
  });

  const endorse = useMutation({
    mutationFn: endorseCandidate,
    onSuccess: (next) => queryClient.setQueryData(keeperKeys.queue, next),
  });

  return { artifact, relayBoard, queue, passport, publish, feature, activate, complete, join, endorse };
}
