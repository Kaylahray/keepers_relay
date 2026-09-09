'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { useEventsQuery } from '@/hooks/useEvents';

/** Sponsor surface — events that accept sponsorship. */
export function SponsorView() {
  const eventsQ = useEventsQuery();
  const open = (eventsQ.data?.events ?? []).filter(
    (e) => e.status === 'registration' || e.status === 'ready',
  );

  return (
    <ArenaStage backHref="/events" backLabel="Events">
      <div className="mb-10 max-w-xl">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
          Prize pool
        </p>
        <h1 className="mt-3 font-poster text-[clamp(2.4rem,5vw,3.75rem)] uppercase leading-[0.92] text-white">
          Sponsor an event
        </h1>
        <p className="mt-3 text-sm font-light leading-relaxed text-white/55">
          Put CKB on a live night. Open an event and contribute to the pot from the event page —
          confirm flows land with the backend sponsorship service.
        </p>
      </div>

      {eventsQ.isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      ) : open.length === 0 ? (
        <p className="text-sm text-white/55">
          No open events accepting sponsors right now.{' '}
          <Link href="/create" className="text-[#99ee2d] underline">
            Host one
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {open.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className="flex items-center justify-between gap-4 border border-white/10 bg-black/40 px-4 py-3 transition hover:border-[#99ee2d]/40"
              >
                <span>
                  <span className="block font-poster text-xl uppercase text-white">
                    {event.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] uppercase text-white/45">
                    Pot {event.pot} CKB · entry {event.entryFee} · {event.status}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold uppercase text-[#99ee2d]">
                  Sponsor →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <ArenaCta href="/events">Browse events</ArenaCta>
        <ArenaCta href="/create">Create event</ArenaCta>
      </div>
    </ArenaStage>
  );
}
