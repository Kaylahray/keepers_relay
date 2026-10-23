'use client';

import Link from 'next/link';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { HomeHero } from '@/components/arena/HomeHero';
import { LaneArt } from '@/components/game/LaneArt';

const STEPS = [
  {
    n: '01',
    title: 'Practise for free',
    body: 'Your own course, as many runs as you like. Pay only to send a winning score.',
  },
  {
    n: '02',
    title: 'Beat the crown',
    body: 'Send a run that beats the standing score. The chain replays it before the crown moves.',
  },
  {
    n: '03',
    title: 'Watch the clock bleed',
    body: 'Each crown adds the fee to the pot and cuts the clock. Hold it at zero to win.',
  },
];

const CUTS = ['10 min', '5 min', '5 min', '2.5 min', '2.5 min', '…', '72 s floor'];

const SOON = ['Bullet Dodge', 'Rhythm Tap', 'Gap Flyer', 'Stacker', 'One-Shot Golf'];

export function HomeView() {
  return (
    <div className="min-h-full w-full bg-[#111] text-white">
      <HomeHero />

      <section className="border-y border-white/10 bg-[#111]">
        <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">How a crown works</p>
          <h2 className="mt-3 max-w-2xl font-poster text-3xl uppercase leading-none text-white sm:text-5xl">
            The pot grows. The clock bleeds.
          </h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="border border-white/10 bg-white/[0.03] p-6">
                <p className="font-poster text-4xl leading-none text-[#99ee2d]">{step.n}</p>
                <h3 className="mt-4 font-poster text-2xl uppercase leading-none text-white">{step.title}</h3>
                <p className="mt-3 text-sm font-light leading-relaxed text-white/60">{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 border border-white/10 bg-black/40 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">Time each crown takes off the clock</p>
            <ol className="mt-3 flex flex-wrap gap-2">
              {CUTS.map((cut, index) => (
                <li
                  key={`${cut}-${index}`}
                  className={`px-3 py-1.5 font-mono text-[12px] uppercase ${cut === '…' ? 'text-white/40' : 'border border-[#ff56f6]/40 text-[#ff8bf9]'}`}
                >
                  {cut === '…' ? cut : `−${cut}`}
                </li>
              ))}
            </ol>

          </div>
        </div>
      </section>

      <section className="relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/uismod/bg-shapes.svg"
          alt=""
          className="pointer-events-none absolute left-0 top-1/2 hidden h-48 w-auto -translate-y-1/2 opacity-80 lg:block"
        />
        <div className="relative mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-16 sm:px-10 lg:grid-cols-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/uismod/organizer.png" alt="" className="mx-auto max-h-72 w-auto object-contain lg:ml-16" />
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">Fair by construction</p>
            <h2 className="mt-3 font-poster text-3xl uppercase leading-none text-white sm:text-4xl">Nobody picks the winner</h2>
            <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/60">
              The rules run on chain, so neither the host nor the app picks the winner. Every crown can be replayed from
              the chain.
            </p>
            <div className="mt-6">
              <ArenaCta href="/verify">Check a crown</ArenaCta>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#111]">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-16 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">Games</p>
            <h2 className="mt-3 font-poster text-3xl uppercase leading-none text-white sm:text-4xl">One referee, many games</h2>
            <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/60">
              Every game plugs into the same clock, pot and crown.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {SOON.map((game) => (
                <li key={game} className="border border-white/15 px-3 py-1.5 font-mono text-[11px] uppercase text-white/50">
                  {game} · soon
                </li>
              ))}
            </ul>
          </div>
          <Link href="/play" className="group block border border-[#99ee2d]/40 bg-black/40 transition hover:border-[#99ee2d]">
            <LaneArt className="h-56 w-full sm:h-64" />
            <div className="flex items-end justify-between gap-4 p-5">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#99ee2d]">Live</p>
                <p className="mt-1 font-poster text-3xl uppercase leading-none text-white">Lane Runner</p>
                <p className="mt-2 max-w-sm text-sm text-white/60">Dodge blocks, grab gold, last two minutes.</p>
              </div>
              <span className="arena-cta shrink-0 px-4 py-2 font-poster text-sm uppercase text-[#111]">Play</span>
            </div>
          </Link>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#111]">
        <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-14 sm:px-10 lg:grid-cols-[1fr_auto]">
          <div className="max-w-xl">
            <h2 className="font-poster text-3xl uppercase leading-none text-white sm:text-4xl">Bring your people</h2>
            <p className="mt-4 text-base font-light leading-relaxed text-white/55">
              Challenge a player or open a crown and share the link.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ArenaCta href="/players">Challenge a friend</ArenaCta>
              <Link href="/create" className="font-poster text-sm uppercase tracking-wide text-[#99ee2d]">
                Host one yourself
              </Link>
            </div>
          </div>
          <LaneArt className="h-[220px] w-full max-w-md border border-white/10 shadow-[-8px_8px_0_#99ee2d] lg:w-[420px]" />
        </div>
      </section>
    </div>
  );
}
