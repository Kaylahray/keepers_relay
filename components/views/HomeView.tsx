'use client';

import Link from 'next/link';
import { Loader2, UsersRound } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useUsername } from '@/hooks/useUsername';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useEventsQuery } from '@/hooks/useEvents';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { EventFeatureCard } from '@/components/arena/EventFeatureCard';

/**
 * Landing — one multiplayer event product.
 * Design: dark #111, lime CTAs, hero + live events (existing Arena language).
 */
export function HomeView() {
  const { isConnected, connect } = useWallet();
  const { username } = useUsername();
  const me = useMyBuilder().data?.builder;
  const hasHandle = Boolean(username?.username || me?.onboarded);
  const eventsQ = useEventsQuery();

  const events = eventsQ.data?.events ?? [];
  const liveEvents = events
    .filter((e) => e.status === 'live' || e.status === 'ready' || e.status === 'registration')
    .slice(0, 4);
  const upcoming = events
    .filter((e) => e.status === 'registration' || e.status === 'ready')
    .slice(0, 4);
  const featuredEvent =
    liveEvents.find((e) => e.status === 'live' || e.status === 'ready') ?? liveEvents[0];

  return (
    <div className="min-h-full w-full bg-[#111] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/uismod/hero-bg.png"
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent to-[#111]" />

        <div className="relative mx-auto grid max-w-[1440px] gap-8 px-5 pb-16 pt-12 sm:px-10 lg:grid-cols-[1fr_1.1fr] lg:items-end lg:pt-16">
          <div className="relative z-10 max-w-xl pb-4">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
              Keepers Relay
            </p>
            <h1 className="mt-3 font-poster text-[clamp(2.75rem,7vw,4.75rem)] uppercase leading-[0.92] text-white">
              Stake in.
              <br />
              Take your turn.
              <br />
              Pass it on.
            </h1>
            <p className="mt-5 max-w-md text-base font-light leading-relaxed text-white/55 sm:text-lg">
              Live multiplayer events on CKB. Answer the challenge, leave your mark, pass the
              state. Growing pots and shrinking clocks — one game, configurable rules.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {!isConnected ? (
                <ArenaCta onClick={() => connect()}>Connect & play</ArenaCta>
              ) : !hasHandle ? (
                <ArenaCta href="/join">Claim @handle</ArenaCta>
              ) : (
                <ArenaCta href="/events">
                  <UsersRound className="h-4 w-4" />
                  Browse events
                </ArenaCta>
              )}
              <Link
                href="/create"
                className="inline-flex items-center border-b border-[#bef970] pb-1 pl-2 text-[15px] font-bold uppercase tracking-wide text-white"
              >
                Create event
              </Link>
            </div>
          </div>

          <div className="relative mx-auto flex w-full max-w-lg flex-col items-center lg:max-w-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/uismod/hero-character.png"
              alt=""
              className="relative z-10 max-h-[min(58vh,560px)] w-auto max-w-full object-contain object-bottom drop-shadow-2xl"
            />

            {featuredEvent ? (
              <div className="absolute bottom-4 right-0 z-20 w-[min(100%,280px)] border border-white/10 bg-black/70 p-4 backdrop-blur-md sm:right-4">
                <p className="font-mono text-[10px] font-bold uppercase text-[#99ee2d]">
                  Featured event
                </p>
                <p className="mt-1 font-poster text-2xl uppercase leading-none text-white">
                  {featuredEvent.name}
                </p>
                <p className="mt-2 text-xs text-white/55">
                  {featuredEvent.pot} CKB · {featuredEvent.playerCount}/{featuredEvent.maxPlayers}{' '}
                  players · {featuredEvent.status}
                </p>
                <ArenaCta href={`/events/${featuredEvent.id}`} className="mt-4 w-full text-center">
                  View event →
                </ArenaCta>
              </div>
            ) : (
              <div className="absolute bottom-4 right-0 z-20 w-[min(100%,260px)] border border-white/10 bg-black/70 p-4 backdrop-blur-md sm:right-4">
                <p className="font-poster text-xl uppercase text-white">No live pot yet</p>
                <ArenaCta href="/create" className="mt-4 w-full text-center">
                  Create event
                </ArenaCta>
              </div>
            )}
          </div>
        </div>
      </section>

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
