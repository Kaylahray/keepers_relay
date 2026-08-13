'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSigner } from '@ckb-ccc/connector-react';
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
import { getChain } from '@/lib/api/chainApi';
import { keeperKeys, chainKeys } from '@/lib/queryClient';
import type { ArtifactKind, LivingArtifact } from '@/types/keeper';
import type { Chain } from '@/types/chain';
import { useWallet } from '@/hooks/useWallet';
import { computeArtifactRoot } from '@/lib/artifact-commit';
import { chainCellConfigured } from '@/lib/registry/config';
import { commitArtifactRoot } from '@/lib/registry/chain-cell';

export { keeperKeys };

export function useRelayBoardQuery() {
  return useQuery({
    queryKey: keeperKeys.relayBoard,
    queryFn: getRelayBoard,
    staleTime: 10_000,
  });
}

export function usePassportQuery() {
  const { address, isConnected } = useWallet();
  return useQuery({
    queryKey: [...keeperKeys.passport, address || 'guest'] as const,
    queryFn: () => getPassport(address!),
    enabled: isConnected && Boolean(address),
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

export type PublishMarkInput = {
  body: string;
  kind: ArtifactKind;
  place?: string;
  address?: string;
  journeyId?: string;
  imageUrl?: string;
  /** Prefer passing the live chain so we can commit artifact_root. */
  chain?: Chain | null;
};

async function sealMark(input: PublishMarkInput, signer: ReturnType<typeof useSigner>) {
  const chain = input.chain ?? (await getChain());
  const { root, rootHex } = await computeArtifactRoot({
    previousRoot: chain.artifactRoot,
    kind: input.kind,
    body: input.body,
    imageUrl: input.imageUrl,
    place: input.place,
  });

  let cellOutPoint = chain.cellOutPoint;
  let txHash: string | undefined;
  let onChain = false;

  if (cellOutPoint && chainCellConfigured()) {
    if (!signer) {
      throw new Error('Connect your wallet to seal this mark into the Chain Cell.');
    }
    try {
      const committed = await commitArtifactRoot(signer, {
        liveOutPoint: cellOutPoint,
        artifactRoot: root,
      });
      cellOutPoint = committed.cellOutPoint;
      txHash = committed.txHash;
      onChain = true;
    } catch (err) {
      // Deployed script may predate seal path — root still commits on the next pass.
      console.warn('[seal] on-chain seal deferred to pass:', err);
    }
  }

  return publishArtifact({
    body: input.body,
    kind: input.kind,
    place: input.place,
    address: input.address,
    journeyId: input.journeyId ?? chain.id,
    imageUrl: input.imageUrl,
    contentHash: rootHex,
    artifactRoot: rootHex,
    cellOutPoint: onChain ? cellOutPoint : undefined,
    txHash,
    artifactRootOnChain: onChain,
  });
}

export function useKeeperEcosystem() {
  const queryClient = useQueryClient();
  const { address, isConnected } = useWallet();
  const signer = useSigner();

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
    queryFn: () => getPassport(address!),
    enabled: isConnected && Boolean(address),
    staleTime: 5_000,
  });

  const publish = useMutation({
    mutationFn: (input: PublishMarkInput) => sealMark(input, signer),
    onSuccess: (next: LivingArtifact) => {
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
