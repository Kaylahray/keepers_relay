'use client';

import Link from 'next/link';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { HomeHero } from '@/components/arena/HomeHero';

export function HomeView() {
  return (
    <div className="min-h-full w-full bg-[#111] text-white">
      <HomeHero />

      <section className="border-y border-white/10 bg-[#111]">
        <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-14 sm:px-10 lg:grid-cols-[1fr_auto]">
          <div className="max-w-xl">
            <h2 className="font-poster text-3xl uppercase leading-none text-white sm:text-4xl">
              Bring your people
            </h2>
            <p className="mt-4 text-base font-light leading-relaxed text-white/55">
              Challenge someone from the players list and host it with their name on the crown. Or
              open one yourself and send the link. The lobby already fits more than two. Everyone
              locks their own entry, then you all answer the same thing. A right answer spends that
              entry, grows the pot, and cuts the clock. The first cut is 10 minutes. Later cuts get
              smaller, down to 72 seconds.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ArenaCta href="/players">Challenge a friend</ArenaCta>
              <Link href="/create" className="font-poster text-sm uppercase tracking-wide text-[#99ee2d]">
                Host one yourself
              </Link>
            </div>
          </div>
          <div className="relative flex h-[240px] w-full max-w-md items-center justify-center lg:w-[420px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/uismod/event-quiz.jpg"
              alt="Quiz"
              className="absolute left-0 top-4 h-[220px] w-[160px] object-cover shadow-[-8px_8px_0_#99ee2d]"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/uismod/event-lyric.jpg"
              alt="Lyrics"
              className="absolute left-[130px] top-10 h-[190px] w-[140px] object-cover opacity-90 shadow-[-4px_4px_0_#e1bf47]"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/uismod/event-place.jpg"
              alt="Where is this"
              className="absolute left-[250px] top-10 h-[190px] w-[140px] object-cover opacity-90 shadow-[-4px_4px_0_#af2a3a]"
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
              You might not know it
            </h2>
            <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/55">
              Today the host writes four options. A quiz, a lyric, a place. Later the bank can be
              random, even questions the host has not seen, because the chain only keeps the root.
              Your friends still sit in the same lobby and race the same shrinking clock.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
