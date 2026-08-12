'use client';

import Link from 'next/link';
import { ArrowUpRight, Compass, LockKeyhole, Trophy } from 'lucide-react';
import type { RelayAttempt, RelayBoard as RelayBoardType } from '@/types/keeper';
import { resolveCover } from '@/lib/poster';
import { RelayStatusBadge } from './RelayStatusBadge';

interface RelayBoardProps {
  board: RelayBoardType;
  attempts: Record<string, RelayAttempt>;
  streak: number;
  isKeeper: boolean;
  activating: boolean;
  error: string | null;
  onActivate: (relayId: string) => void;
  coverImageUrl?: string;
  creatureName?: string;
}

export function RelayBoard({
  board,
  attempts,
  streak,
  isKeeper,
  activating,
  error,
  onActivate,
  coverImageUrl,
  creatureName,
}: RelayBoardProps) {
  const cover = resolveCover(coverImageUrl, creatureName || 'Relay');
  return (
    <section
      aria-labelledby="relay-title"
      className="neo-card overflow-hidden bg-[#224cff] p-0 text-black"
    >
      <div className="relative h-36 border-b-[3px] border-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt={creatureName ? `${creatureName} Cell` : 'This streak’s Cell'}
          className="h-full w-full object-cover"
        />
        <div className="absolute bottom-3 left-3 border-2 border-black bg-[#d6ff00] px-2 py-1 text-[10px] font-black uppercase">
          CKB relay board
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 stroke-[3]" />
              <span className="text-[10px] font-black uppercase tracking-[0.16em]">
                Do something real
              </span>
            </div>
            <h2
              id="relay-title"
              className="mt-2 font-poster text-3xl uppercase leading-[.9] text-[#fff8e7]"
            >
              Move the ecosystem
            </h2>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-[#fff8e7]">
              The Keeper picks the signal. Anyone can complete it — but a Relay now needs real
              proof, not a click.
            </p>
          </div>
          <span className="shrink-0 border-2 border-black bg-[#ff4cbd] px-2 py-1 font-mono text-[10px] font-bold">
            {streak} DAY STREAK
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {board.relays.map((relay) => {
            const active = relay.id === board.activeRelayId;
            const attempt = attempts[relay.id];
            return (
              <article
                key={relay.id}
                className={`border-[3px] border-black p-4 ${active ? 'bg-[#d6ff00]' : 'bg-[#fff8e7]'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider">
                      {relay.partner} · {relay.category}
                    </p>
                    <h3 className="mt-1 text-base font-black uppercase">{relay.title}</h3>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {active && (
                      <span className="border-2 border-black bg-[#ff4cbd] px-2 py-1 text-[10px] font-black uppercase">
                        LIVE
                      </span>
                    )}
                    {attempt && <RelayStatusBadge status={attempt.status} />}
                  </div>
                </div>
                <p className="mt-2 text-sm font-semibold leading-relaxed">{relay.description}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs font-black">
                    <Trophy className="h-3.5 w-3.5 stroke-[3]" />+{relay.rewardXp} XP ·{' '}
                    {relay.estimatedMinutes} MIN
                  </span>
                  <div className="flex gap-2">
                    {isKeeper && !active && (
                      <button
                        type="button"
                        onClick={() => onActivate(relay.id)}
                        disabled={activating}
                        className="border-2 border-black bg-[#ffe454] px-2.5 py-2 text-xs font-black disabled:opacity-40"
                      >
                        SET LIVE
                      </button>
                    )}
                    <Link
                      href={`/relays/${relay.id}`}
                      className="neo-button flex items-center gap-1.5 bg-black px-3 py-2 text-xs font-black text-[#fff8e7]"
                    >
                      OPEN RELAY
                      <ArrowUpRight className="h-3.5 w-3.5 stroke-[3]" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-black pt-3">
          <span className="flex items-center gap-2 text-[11px] font-bold text-[#fff8e7]">
            <LockKeyhole className="h-3.5 w-3.5 stroke-[3]" /> Only the active Keeper can set the
            live mission.
          </span>
          <Link
            href="/relays"
            className="border-2 border-black bg-[#fff8e7] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider"
          >
            All relays
          </Link>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs font-bold text-red-900">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
