'use client';

import { Crown, LockKeyhole } from 'lucide-react';
import { useKeeperEcosystem } from '@/hooks/useKeeperEcosystem';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useWallet } from '@/hooks/useWallet';
import { ArtifactStudio } from './ArtifactStudio';
import { KeeperQueue } from './KeeperQueue';
import { PassportCard } from './PassportCard';
import { RelayBoard } from './RelayBoard';

interface KeeperExperienceProps {
  currentOwner: string;
  chainAlive: boolean;
  chainId: string;
  seedPrompt?: string;
  hasContributedThisTurn?: boolean;
  coverImageUrl?: string;
  creatureName?: string;
  onChooseNext: (name: string) => void;
  /** Hide the big intro chrome when nested under the journey homepage. */
  compact?: boolean;
}

export function KeeperExperience({
  currentOwner,
  chainAlive,
  chainId,
  seedPrompt,
  hasContributedThisTurn = false,
  coverImageUrl,
  creatureName,
  onChooseNext,
  compact = false,
}: KeeperExperienceProps) {
  const ecosystem = useKeeperEcosystem();
  const { isConnected, connect } = useWallet();
  const myBuilder = useMyBuilder();
  const me = myBuilder.data?.builder;
  const isKeeper =
    chainAlive && !!me?.onboarded && me.displayName.toLowerCase() === currentOwner.toLowerCase();

  const artifact = ecosystem.artifact.data;
  const relayBoard = ecosystem.relayBoard.data;
  const attempts = ecosystem.attempts.data;
  const queue = ecosystem.queue.data;
  const passport = ecosystem.passport.data;

  if (!artifact || !relayBoard || !attempts || !queue || !passport) {
    return (
      <section
        className="mx-auto mt-5 h-64 w-full max-w-5xl animate-pulse border-[3px] border-black bg-[#ff4cbd]"
        aria-label="Loading community layer"
      />
    );
  }

  const artifactError =
    ecosystem.publish.error?.message ?? ecosystem.feature.error?.message ?? null;
  const relayError = ecosystem.activate.error?.message ?? null;
  const queueError = ecosystem.join.error?.message ?? ecosystem.endorse.error?.message ?? null;

  return (
    <section
      aria-labelledby="keeper-layer-title"
      className={`mx-auto w-full max-w-5xl px-3 pb-16 sm:px-6 ${compact ? 'mt-0 pt-6' : 'mt-5 pb-20'}`}
    >
      {!compact && (
      <div className="mb-8 border-[3px] border-black bg-black p-5 text-[#fff8e7] shadow-[7px_7px_0_#ff4cbd]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#d6ff00]">
              The part worth coming back for
            </p>
            <h2
              id="keeper-layer-title"
              className="mt-2 font-poster text-4xl uppercase leading-[.85] sm:text-5xl"
            >
              Beyond
              <br />
              the streak.
            </h2>
            <p className="mt-4 max-w-xl text-sm font-semibold leading-relaxed text-[#fff8e7]">
              Build CKB culture, complete a mission, stack your proof, then make your case for the
              Cell. Connected builders appear on the roster so the crew can see each other.
            </p>
          </div>
          <div
            className={`flex items-center gap-2 border-2 border-black px-3 py-2 text-xs font-black ${
              isKeeper ? 'bg-[#d6ff00] text-black' : 'bg-[#ff4cbd] text-black'
            }`}
          >
            {isKeeper ? (
              <Crown className="h-4 w-4 stroke-[3]" />
            ) : (
              <LockKeyhole className="h-4 w-4 stroke-[3]" />
            )}
            {isKeeper ? 'YOU HOLD THE KEEPER PASS' : `${currentOwner} HOLDS THE PASS`}
          </div>
        </div>
        {!isConnected && (
          <button
            type="button"
            onClick={() => connect()}
            className="neo-button mt-4 bg-[#d6ff00] px-4 py-2 text-xs font-black uppercase text-black"
          >
            Connect wallet to join as yourself
          </button>
        )}
      </div>
      )}

      {compact && (
        <p id="keeper-layer-title" className="mb-4 text-sm font-semibold text-black/70">
          Relays, passport, and the handoff queue.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        {!compact ? (
        <ArtifactStudio
          artifact={artifact}
          chainId={chainId}
          isKeeper={isKeeper}
          publishing={ecosystem.publish.isPending}
          featuring={ecosystem.feature.isPending}
          error={artifactError}
          seedPrompt={seedPrompt}
          hasContributedThisTurn={hasContributedThisTurn}
          coverImageUrl={coverImageUrl}
          creatureName={creatureName}
          onPublish={(input) => ecosystem.publish.mutate(input)}
          onFeature={(id) => ecosystem.feature.mutate(id)}
        />
        ) : (
          <div className="neo-card bg-[#fff8e7] p-5">
            <p className="text-[10px] font-black uppercase tracking-wider">Archive</p>
            <p className="mt-2 text-sm font-semibold">
              Contributions live on the journey trail above. Open the full archive anytime.
            </p>
            <a
              href={`/artifact/${chainId}`}
              className="neo-button mt-4 inline-block bg-[#224cff] px-3 py-2 text-xs font-black uppercase text-[#fff8e7]"
            >
              Full artifact archive
            </a>
          </div>
        )}
        <PassportCard profile={passport} characterId={me?.characterId ?? passport.characterId} />
      </div>

      <div className="mt-7 grid gap-7 lg:grid-cols-2">
        <RelayBoard
          board={relayBoard}
          attempts={attempts}
          streak={passport.relayStreak}
          isKeeper={isKeeper}
          activating={ecosystem.activate.isPending}
          error={relayError}
          coverImageUrl={coverImageUrl}
          creatureName={creatureName}
          onActivate={(id) => ecosystem.activate.mutate(id)}
        />
        <KeeperQueue
          entries={queue}
          isKeeper={isKeeper}
          joining={ecosystem.join.isPending}
          endorsing={ecosystem.endorse.isPending}
          error={queueError}
          defaultName={me?.displayName ?? ''}
          onJoin={(input) => ecosystem.join.mutate(input)}
          onEndorse={(entry) =>
            ecosystem.endorse.mutate(entry.id, {
              onSuccess: () => onChooseNext(entry.name),
            })
          }
        />
      </div>
    </section>
  );
}
