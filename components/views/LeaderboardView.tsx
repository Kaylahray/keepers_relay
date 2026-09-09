'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { useEventsQuery } from '@/hooks/useEvents';

/** Global leaderboard scaffold — per-event rankings until backend aggregates. */
export function LeaderboardView() {
  const eventsQ = useEventsQuery();
  const settled = (eventsQ.data?.events ?? []).filter(
    (e) => e.status === 'settled' || e.status === 'finished',
  );

  return (
    <ArenaStage backHref="/" backLabel="Arena">
      <div className="mb-10 max-w-xl">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
          Rankings
        </p>
        <h1 className="mt-3 font-poster text-[clamp(2.4rem,5vw,3.75rem)] uppercase leading-[0.92] text-white">
          Leaderboard
        </h1>
        <p className="mt-3 text-sm font-light leading-relaxed text-white/55">
          Cross-event standings land with the backend aggregate. For now, open a finished event
          for full rankings, accuracy, and payout.
        </p>
      </div>

      {eventsQ.isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      ) : settled.length === 0 ? (
        <p className="text-sm text-white/55">
          No settled events yet.{' '}
          <Link href="/events" className="text-[#99ee2d] underline">
            Browse live
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {settled.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}/results`}
                className="flex items-center justify-between gap-4 border border-white/10 bg-black/40 px-4 py-3 transition hover:border-[#99ee2d]/40"
              >
                <span>
                  <span className="block font-poster text-xl uppercase text-white">
                    {event.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] uppercase text-white/45">
                    {event.pot} CKB pot · {event.playerCount} players · {event.status}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold uppercase text-[#99ee2d]">
                  Results →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10">
        <ArenaCta href="/events">Browse events</ArenaCta>
      </div>
    </ArenaStage>
  );
}
