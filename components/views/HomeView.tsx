'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useEventsQuery } from '@/hooks/useEvents';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { EventFeatureCard } from '@/components/arena/EventFeatureCard';
import { HomeHero } from '@/components/arena/HomeHero';

/**
 * Landing — one multiplayer event product.
 * Design: dark #111, lime CTAs, Figma hero + live events.
 */
export function HomeView() {
  const eventsQ = useEventsQuery();

  const events = eventsQ.data?.events ?? [];
  const liveEvents = events
    .filter((e) => e.status === 'live' || e.status === 'ready' || e.status === 'registration')
    .slice(0, 4);
  const upcoming = events
    .filter((e) => e.status === 'registration' || e.status === 'ready')
    .slice(0, 4);
  const heroEvents = events
    .filter((e) => e.status === 'live' || e.status === 'ready' || e.status === 'registration')
    .slice(0, 3);

  return (
    <div className="min-h-full w-full bg-[#111] text-white">
      <HomeHero events={heroEvents} />

      <section className="mx-auto max-w-[1440px] px-5 py-14 sm:px-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-poster text-3xl uppercase text-white sm:text-4xl">Live & open</h2>
          <Link
            href="/events"
            className="border-b border-[#bef970] pb-1 text-sm font-bold uppercase tracking-wide text-white"
          >
            View all
          </Link>
        </div>

        {eventsQ.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Scanning…
          </p>
        ) : liveEvents.length === 0 ? (
          <p className="text-sm text-white/55">
            Nothing live yet.{' '}
            <Link href="/create" className="text-[#99ee2d] underline">
              Create an event
            </Link>
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {liveEvents.map((event, i) => (
              <li key={event.id}>
                <EventFeatureCard event={event} artIndex={i} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {upcoming.length > 0 ? (
        <section className="mx-auto max-w-[1440px] border-t border-white/10 px-5 py-14 sm:px-10">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-poster text-3xl uppercase text-white sm:text-4xl">Upcoming</h2>
            <Link
              href="/events"
              className="border-b border-[#bef970] pb-1 text-sm font-bold uppercase tracking-wide text-white"
            >
              Browse
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {upcoming.map((event, i) => (
              <li key={event.id}>
                <EventFeatureCard event={event} artIndex={i + 2} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-y border-white/10 bg-[#111]">
        <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-14 sm:px-10 lg:grid-cols-[1fr_auto]">
          <div className="max-w-xl">
            <h2 className="font-poster text-3xl uppercase leading-none text-white sm:text-4xl">
              How it works
            </h2>
            <p className="mt-4 text-base font-light leading-relaxed text-white/55">
              Stake into an event. When it&apos;s your turn, you get a challenge and a clock.
              Answer, leave your mark, pass the state. Repeat until settlement — winners take the
              pot.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ArenaCta href="/how-it-works">Learn more</ArenaCta>
              <ArenaCta href="/create">Create event</ArenaCta>
            </div>
          </div>
          <div className="relative flex h-[240px] w-full max-w-md items-center justify-center lg:w-[420px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/uismod/game-1.png"
              alt=""
              className="absolute left-0 top-4 h-[220px] w-[160px] object-cover shadow-[-8px_8px_0_#99ee2d]"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/uismod/game-2.png"
              alt=""
              className="absolute left-[130px] top-10 h-[190px] w-[140px] object-cover opacity-90 shadow-[-4px_4px_0_#f15d09]"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/uismod/game-3.png"
              alt=""
              className="absolute left-[250px] top-10 h-[190px] w-[140px] object-cover opacity-90 shadow-[-4px_4px_0_#f15d09]"
            />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/uismod/bg-shapes.svg"
          alt=""
          className="pointer-events-none absolute left-0 top-1/2 hidden h-48 w-auto -translate-y-1/2 opacity-80 lg:block"
        />
        <div className="relative mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-16 sm:px-10 lg:grid-cols-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/uismod/organizer.png"
            alt=""
            className="mx-auto max-h-72 w-auto object-contain lg:ml-16"
          />
          <div>
            <h2 className="font-poster text-3xl uppercase leading-none text-white sm:text-4xl">
              Host an event
            </h2>
            <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/55">
              Set the rules, lock the question pool, share a link — or start from a community
              for recurring nights.
            </p>
            <ArenaCta href="/communities" className="mt-8">
              Browse communities
            </ArenaCta>
          </div>
        </div>
      </section>
    </div>
  );
}
