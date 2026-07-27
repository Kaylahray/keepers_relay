'use client';

import { CheckCircle2, Compass, LockKeyhole, Sparkles, Trophy } from 'lucide-react';
import type { PassportProfile, RelayBoard as RelayBoardType } from '@/types/keeper';

interface RelayBoardProps {
  board: RelayBoardType;
  passport: PassportProfile;
  isKeeper: boolean;
  activating: boolean;
  completing: boolean;
  error: string | null;
  onActivate: (relayId: string) => void;
  onComplete: (relayId: string) => void;
}

const RELAY_ART_URL =
  'https://cdn.magicpatterns.com/patterns/generated-images/e059f409-1b58-4f8b-874d-5e331eab0847.jpg';

export function RelayBoard({
  board,
  passport,
  isKeeper,
  activating,
  completing,
  error,
  onActivate,
  onComplete,
}: RelayBoardProps) {
  return (
    <section
      aria-labelledby="relay-title"
      className="neo-card overflow-hidden bg-[#224cff] p-0 text-black"
    >
      <div className="relative h-36 border-b-[3px] border-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={RELAY_ART_URL}
          alt="Colorful collage of chain links and community symbols"
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
              The Keeper picks the signal. Anyone can complete it and keep their streak hot.
            </p>
          </div>
          <span className="border-2 border-black bg-[#ff4cbd] px-2 py-1 font-mono text-[10px] font-bold">
            {passport.relayStreak} DAY STREAK
          </span>
        </div>
        <div className="mt-5 space-y-3">
          {board.relays.map((relay) => {
            const active = relay.id === board.activeRelayId;
            const complete = passport.completedRelayIds.includes(relay.id);
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
                  {active && (
                    <span className="border-2 border-black bg-[#ff4cbd] px-2 py-1 text-[10px] font-black uppercase">
                      LIVE
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold leading-relaxed">{relay.description}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs font-black">
                    <Trophy className="h-3.5 w-3.5 stroke-[3]" />+{relay.rewardXp} XP
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
                    <button
                      type="button"
                      onClick={() => onComplete(relay.id)}
                      disabled={complete || completing}
                      className="neo-button flex items-center gap-1.5 bg-black px-3 py-2 text-xs font-black text-[#fff8e7] disabled:opacity-40"
                    >
                      {complete ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" /> CLAIMED
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" /> DO RELAY
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-2 border-t-2 border-black pt-3 text-[11px] font-bold text-[#fff8e7]">
          <LockKeyhole className="h-3.5 w-3.5 stroke-[3]" /> Only the active Keeper can set the live
          mission.
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
