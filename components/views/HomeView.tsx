'use client';

import Link from 'next/link';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { HomeHero } from '@/components/arena/HomeHero';
import { LaneArt } from '@/components/game/LaneArt';
import { STORY, StoryPicture } from '@/components/explain/StoryPicture';

const SOON = ['Bullet Dodge', 'Rhythm Tap', 'Gap Flyer', 'Stacker', 'One-Shot Golf'];

export function HomeView() {
  return (
    <div className="min-h-full w-full bg-[#111] text-white">
      <HomeHero />

      <section className="border-y border-white/10 bg-[#111]">
        <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">How to play</p>
          <h2 className="mt-3 max-w-2xl font-poster text-3xl uppercase leading-none text-white sm:text-5xl">
            Beat the score. Hold the crown. Win the prize.
          </h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STORY.map((step, index) => (
              <li key={step.kind} className="border border-white/10 bg-white/[0.03]">
                <StoryPicture kind={step.kind} className="aspect-[16/10] border-0 border-b" />
                <div className="p-5">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#99ee2d]">Step {index + 1}</p>
                  <h3 className="mt-2 font-poster text-xl uppercase leading-none text-white">{step.title}</h3>
                  <p className="mt-3 text-sm font-light leading-relaxed text-white/65">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-2xl text-sm text-white/55">
            Each grab takes time off the clock: 10 minutes the first time, then 5, then less, never under 72 seconds. So the
            more people play, the faster it ends.
          </p>
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
          <ReplayArt />
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">Fair play</p>
            <h2 className="mt-3 font-poster text-3xl uppercase leading-none text-white sm:text-4xl">Nobody picks the winner</h2>
            <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/60">
              Your phone sends your moves, not your score. The CKB chain plays your moves again and works out the score
              itself, so nobody (not the host, not us) can change who wins.
            </p>
            <div className="mt-6">
              <ArenaCta href="/verify">Check any game</ArenaCta>
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
              More games are coming. They all use the same clock, prize and crown.
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
                <p className="mt-2 max-w-sm text-sm text-white/60">Drive through the neon city. Dodge barriers, grab coins. Two minutes a run.</p>
              </div>
              <span className="arena-cta shrink-0 px-4 py-2 font-poster text-sm uppercase text-[#111]">Play</span>
            </div>
          </Link>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#111]">
        <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-14 sm:px-10 lg:grid-cols-[1fr_auto]">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">Multiplayer</p>
            <h2 className="mt-3 font-poster text-3xl uppercase leading-none text-white sm:text-4xl">Play with your friends</h2>
            <p className="mt-4 text-base font-light leading-relaxed text-white/55">
              Open a game and drop the link in your group chat. Everyone races the same clock, and whoever holds the crown at
              zero wins the prize.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ArenaCta href="/players">Challenge a friend</ArenaCta>
              <Link href="/create" className="font-poster text-sm uppercase tracking-wide text-[#99ee2d]">
                Host one yourself
              </Link>
            </div>
          </div>
          <LobbyArt />
        </div>
      </section>
    </div>
  );
}

/** How the chain judges a run: the recording goes in, CKB-VM plays it again, the score comes out. */
function ReplayArt() {
  const moves = ['0012·1', '0047·2', '0081·0', '0133·1', '0190·2', '0244·0'];
  return (
    <div className="relative z-10 mx-auto w-full max-w-md border border-white/10 bg-[#0b0b12] p-5 lg:ml-16" aria-hidden>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Your run</p>
      <ul className="mt-2 grid grid-cols-3 gap-1.5 font-mono text-[11px] text-[#ff8bf9]">
        {moves.map((move) => (
          <li key={move} className="border border-[#ff56f6]/30 px-2 py-1">
            {move}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 font-mono text-[10px] text-white/35">tick · lane, every move you made</p>
      <div className="my-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-white/15" />
        <span className="border border-[#406aff]/60 bg-[#406aff]/10 px-3 py-1.5 font-mono text-[11px] uppercase text-[#9db3ff]">
          CKB-VM replays it
        </span>
        <span className="h-px flex-1 bg-white/15" />
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Chain&apos;s score</p>
          <p className="font-poster text-5xl leading-none text-[#99ee2d]">412</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">To beat</p>
          <p className="font-poster text-3xl leading-none text-white/60">388</p>
        </div>
      </div>
      <p className="mt-3 border-t border-white/10 pt-3 font-mono text-[11px] uppercase text-[#e1bf47]">Crown moves · prize +50 CKB</p>
    </div>
  );
}

/** A lobby in miniature: seats filling up around one shared clock. */
function LobbyArt() {
  const seats = [
    { name: 'ada', note: 'King · 412', king: true },
    { name: 'tunde', note: 'Best 388' },
    { name: 'you', note: 'Practising' },
    { name: 'mira', note: 'Joined' },
  ];
  return (
    <div className="w-full max-w-md border border-white/10 bg-black/50 p-5 shadow-[-8px_8px_0_#99ee2d] lg:w-[420px]" aria-hidden>
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Prize</p>
          <p className="font-poster text-4xl leading-none text-[#99ee2d]">150</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Clock</p>
          <p className="font-poster text-4xl leading-none text-white">4:12</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full bg-white/10">
        <div className="h-full w-[38%] bg-gradient-to-r from-[#ff56f6] to-[#406aff]" />
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2">
        {seats.map((seat) => (
          <li
            key={seat.name}
            className={`border px-3 py-2.5 ${seat.king ? 'border-[#e1bf47]/60 bg-[#e1bf47]/10' : 'border-white/10'}`}
          >
            <p className="font-poster text-lg uppercase leading-none text-white">@{seat.name}</p>
            <p className={`mt-1 font-mono text-[10px] uppercase ${seat.king ? 'text-[#e1bf47]' : 'text-white/45'}`}>
              {seat.note}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
