'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { EventFeatureCard } from '@/components/arena/EventFeatureCard';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaRailCard, ArenaStage } from '@/components/arena/ArenaStage';
import { useEventsQuery } from '@/hooks/useEvents';
import { EVENT_MODE_LABEL } from '@/types/event';

export function EventsListView() {
  const events = useEventsQuery();
  const list = events.data?.events ?? [];
  const live = list.filter((e) => e.status === 'live' || e.status === 'ready');
  const rail = (live.length > 0 ? live : list).slice(0, 4);

  return (
    <ArenaStage backHref="/" backLabel="Arena">
      <section className="grid items-end gap-8 lg:grid-cols-[1fr_auto_minmax(260px,320px)] lg:gap-0">
        <div className="relative z-10 max-w-xl pb-6">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
            Stake · play · pass
          </p>
          <h1 className="mt-3 font-poster text-[clamp(2.75rem,6vw,4.5rem)] uppercase leading-[0.92] text-white">
            Live
            <br />
            Events
          </h1>
          <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/60">
            Timed multiplayer on a moving Cell. Join a pot, answer on your turn, pass it on.
            One game — configurable rules.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ArenaCta href="/create">Create event</ArenaCta>
            <Link
              href="/host"
              className="border-b border-[#bef970] pb-1 text-sm font-bold uppercase tracking-wide text-white"
            >
              Host dashboard →
            </Link>
          </div>
        </div>

        <div className="relative mx-auto hidden h-[min(52vh,480px)] w-[280px] shrink-0 lg:block xl:w-[320px]">
          <div
            className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-[#99ee2d]/20 blur-[80px]"
            aria-hidden
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/uismod/hero-character.png"
            alt=""
            className="relative z-10 h-full w-full object-contain object-bottom drop-shadow-[0_0_36px_rgba(153,238,45,0.25)]"
          />
        </div>

        <aside className="relative z-10 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div
            className="pointer-events-none absolute left-0 top-8 hidden h-[70%] w-px bg-gradient-to-b from-[#99ee2d] via-white/20 to-transparent lg:block"
            aria-hidden
          />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
            Hot right now
          </p>
          <ul className="mt-4 space-y-2.5">
            {events.isLoading ? (
              <li className="flex items-center gap-2 text-sm text-white/45">
                <Loader2 className="h-4 w-4 animate-spin" /> Scanning…
              </li>
            ) : rail.length === 0 ? (
              <li className="text-sm text-white/50">No events yet.</li>
            ) : (
              rail.map((event) => (
                <li key={event.id}>
                  <ArenaRailCard
                    href={
                      event.status === 'live'
                        ? `/events/${event.id}/live`
                        : `/events/${event.id}`
                    }
                    eyebrow={`${EVENT_MODE_LABEL[event.mode]} · ${event.status}`}
                    title={event.name}
                    meta={`${event.pot} CKB · ${event.playerCount}/${event.maxPlayers}`}
                    cover={event.coverImageUrl || '/uismod/game-2.png'}
                    cta={event.status === 'live' ? 'Play' : 'Join'}
                  />
                </li>
              ))
            )}
          </ul>
        </aside>
      </section>

      <section className="relative z-10 mt-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-poster text-3xl uppercase text-white sm:text-4xl">All events</h2>
          <Link
            href="/leaderboard"
            className="border-b border-white/30 pb-1 text-[10px] font-bold uppercase text-white/70"
          >
            Leaderboard →
          </Link>
        </div>
        {events.isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        ) : list.length === 0 ? (
          <p className="text-sm text-white/55">
            Nothing live.{' '}
            <Link href="/create" className="text-[#99ee2d] underline">
              Host one
            </Link>
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((event, i) => (
              <li key={event.id}>
                <EventFeatureCard event={event} artIndex={i} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </ArenaStage>
  );
}
