'use client';

import Link from 'next/link';
import { ArrowUpRight, Compass, Trophy } from 'lucide-react';
import {
  usePassportQuery,
  useRelayAttemptsQuery,
  useRelayBoardQuery,
} from '@/hooks/useKeeperEcosystem';
import { PageShell } from '@/components/PageShell';
import { RelayStatusBadge } from '@/components/RelayStatusBadge';

export function RelayHubView() {
  const board = useRelayBoardQuery();
  const attempts = useRelayAttemptsQuery();
  const passport = usePassportQuery();

  return (
    <PageShell
      eyebrow="CKB relay board"
      title="Missions worth doing"
      intro="Small missions chosen by whoever holds the Cell."
      backHref="/"
      backLabel="Back to the live chain"
    >
      {board.isLoading || !board.data || !attempts.data ? (
        <div className="h-56 animate-pulse border-[3px] border-black bg-[#ff4cbd]" />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Stat label="Relays live" value={String(board.data.relays.length)} bg="#d6ff00" />
            <Stat
              label="Your streak"
              value={String(passport.data?.relayStreak ?? 0)}
              bg="#ffe454"
            />
            <Stat
              label="Verified claims"
              value={String(passport.data?.completedRelayIds.length ?? 0)}
              bg="#ff4cbd"
            />
          </div>

          <div className="space-y-4">
            {board.data.relays.map((relay) => {
              const attempt = attempts.data[relay.id];
              const active = relay.id === board.data.activeRelayId;
              return (
                <article
                  key={relay.id}
                  className={`neo-card p-5 ${active ? 'bg-[#d6ff00]' : 'bg-[#fff8e7]'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider">
                        {relay.partner} · {relay.category} · {relay.estimatedMinutes} min
                      </p>
                      <h2 className="mt-1 font-poster text-3xl uppercase leading-[.92]">
                        {relay.title}
                      </h2>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {active && (
                        <span className="border-2 border-black bg-[#ff4cbd] px-2 py-1 text-[10px] font-black uppercase">
                          Live mission
                        </span>
                      )}
                      {attempt && <RelayStatusBadge status={attempt.status} />}
                    </div>
                  </div>

                  <p className="mt-3 text-sm font-semibold leading-relaxed">{relay.description}</p>

                  <div className="mt-4 border-t-2 border-black pt-3 text-xs font-semibold">
                    <p>
                      <span className="font-black uppercase">Proof required: </span>
                      {relay.proofLabel} ·{' '}
                      {relay.reviewMode === 'manual' ? 'community review' : 'automated check'}
                    </p>
                    <p className="mt-1">
                      <span className="font-black uppercase">Eligibility: </span>
                      {relay.eligibility}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-black">
                      <Trophy className="h-4 w-4 stroke-[3]" />+{relay.rewardXp} XP ·{' '}
                      {relay.rewardLabel}
                    </span>
                    <Link
                      href={`/relays/${relay.id}`}
                      className="neo-button flex items-center gap-1.5 bg-[#224cff] px-4 py-2.5 text-xs font-black uppercase text-[#fff8e7]"
                    >
                      <Compass className="h-4 w-4 stroke-[3]" />
                      Open relay
                      <ArrowUpRight className="h-3.5 w-3.5 stroke-[3]" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </PageShell>
  );
}

function Stat({ label, value, bg }: { label: string; value: string; bg: string }) {
  return (
    <div className="neo-card-soft p-4" style={{ backgroundColor: bg }}>
      <p className="font-poster text-4xl leading-none">{value}</p>
      <p className="mt-2 text-[10px] font-black uppercase tracking-wider">{label}</p>
    </div>
  );
}
