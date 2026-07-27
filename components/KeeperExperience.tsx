'use client';

import { Crown, LockKeyhole } from 'lucide-react';
import { useKeeperEcosystem } from '@/hooks/useKeeperEcosystem';
import { ArtifactStudio } from './ArtifactStudio';
import { KeeperQueue } from './KeeperQueue';
import { PassportCard } from './PassportCard';
import { RelayBoard } from './RelayBoard';

interface KeeperExperienceProps {
  currentOwner: string;
  chainAlive: boolean;
  onChooseNext: (name: string) => void;
}

const DEMO_KEEPER = 'Emma';

export function KeeperExperience({
  currentOwner,
  chainAlive,
  onChooseNext,
}: KeeperExperienceProps) {
  const ecosystem = useKeeperEcosystem();
  const isKeeper = chainAlive && currentOwner === DEMO_KEEPER;
  const artifact = ecosystem.artifact.data;
  const relayBoard = ecosystem.relayBoard.data;
  const queue = ecosystem.queue.data;
  const passport = ecosystem.passport.data;

  if (!artifact || !relayBoard || !queue || !passport) {
    return (
      <section
        className="mx-auto mt-5 h-64 w-full max-w-5xl animate-pulse border-[3px] border-black bg-[#ff4cbd]"
        aria-label="Loading community layer"
      />
    );
  }

  const artifactError =
    ecosystem.publish.error?.message ?? ecosystem.feature.error?.message ?? null;
  const relayError =
    ecosystem.activate.error?.message ?? ecosystem.complete.error?.message ?? null;
  const queueError = ecosystem.join.error?.message ?? ecosystem.endorse.error?.message ?? null;

  return (
    <section
      aria-labelledby="keeper-layer-title"
      className="mx-auto mt-5 w-full max-w-5xl px-3 pb-20 sm:px-6"
    >
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
              Cell.
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
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <ArtifactStudio
          artifact={artifact}
          isKeeper={isKeeper}
          publishing={ecosystem.publish.isPending}
          featuring={ecosystem.feature.isPending}
          error={artifactError}
          onPublish={(input) => ecosystem.publish.mutate(input)}
          onFeature={(id) => ecosystem.feature.mutate(id)}
        />
        <PassportCard profile={passport} />
      </div>
      <div className="mt-7 grid gap-7 lg:grid-cols-2">
        <RelayBoard
          board={relayBoard}
          passport={passport}
          isKeeper={isKeeper}
          activating={ecosystem.activate.isPending}
          completing={ecosystem.complete.isPending}
          error={relayError}
          onActivate={(id) => ecosystem.activate.mutate(id)}
          onComplete={(id) => ecosystem.complete.mutate(id)}
        />
        <KeeperQueue
          entries={queue}
          isKeeper={isKeeper}
          joining={ecosystem.join.isPending}
          endorsing={ecosystem.endorse.isPending}
          error={queueError}
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
