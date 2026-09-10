'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EventSummary } from '@/types/event';

const HERO_BLURB =
  'Live multiplayer events on CKB. Answer the challenge, leave your mark, pass the state. Growing pots and shrinking clocks — one game, configurable rules.';

type HeroSlide = {
  id: string;
  month: string;
  day: string;
  title: string;
  videoSrc: string;
  href: string;
  endsAtMs: number | null;
  staticTimer: string;
};

const FALLBACK_SLIDES: HeroSlide[] = [
  {
    id: 'slide-1',
    month: 'MARCH',
    day: '02',
    title: 'Featured event',
    videoSrc: '/uismod/hero-card.png',
    href: '/events',
    endsAtMs: null,
    staticTimer: '14:32:38',
  },
  {
    id: 'slide-2',
    month: 'APRIL',
    day: '18',
    title: 'Open pot',
    videoSrc: '/uismod/game-1.png',
    href: '/create',
    endsAtMs: null,
    staticTimer: '09:14:22',
  },
  {
    id: 'slide-3',
    month: 'MAY',
    day: '07',
    title: 'Community night',
    videoSrc: '/uismod/game-2.png',
    href: '/events',
    endsAtMs: null,
    staticTimer: '21:05:44',
  },
];

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

function formatMonthDay(iso: string): { month: string; day: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { month: 'SOON', day: '--' };
  return {
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: pad2(d.getDate()),
  };
}

function eventToSlide(event: EventSummary, videoSrc: string): HeroSlide {
  const { month, day } = formatMonthDay(event.startAt);
  const startMs = new Date(event.startAt).getTime();
  const endsAtMs = Number.isFinite(startMs) && startMs > Date.now() ? startMs : null;
  return {
    id: event.id,
    month,
    day,
    title: event.name,
    videoSrc,
    href: `/events/${event.id}`,
    endsAtMs,
    staticTimer: '00:00:00',
  };
}

function useSlideTimer(slide: HeroSlide) {
  const [label, setLabel] = useState(slide.staticTimer);

  useEffect(() => {
    if (slide.endsAtMs == null) {
      setLabel(slide.staticTimer);
      return;
    }
    const tick = () => {
      const rem = Math.max(0, slide.endsAtMs! - Date.now());
      const h = Math.floor(rem / 3_600_000);
      const m = Math.floor((rem % 3_600_000) / 60_000);
      const s = Math.floor((rem % 60_000) / 1000);
      setLabel(`${pad2(h)}:${pad2(m)}:${pad2(s)}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [slide.endsAtMs, slide.staticTimer, slide.id]);

  return label;
}

function buildSlides(events: EventSummary[]): HeroSlide[] {
  const thumbs = ['/uismod/hero-card.png', '/uismod/game-1.png', '/uismod/game-2.png'];
  const fromEvents = events.slice(0, 3).map((e, i) => eventToSlide(e, thumbs[i] ?? thumbs[0]));
  if (fromEvents.length >= 3) return fromEvents;
  return [...fromEvents, ...FALLBACK_SLIDES].slice(0, 3);
}

/**
 * Home hero — Figma language, responsive stack on small screens.
 */
export function HomeHero({ events }: { events: EventSummary[] }) {
  const slides = useMemo(() => buildSlides(events), [events]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const slide = slides[Math.min(active, slides.length - 1)] ?? slides[0];
  const timer = useSlideTimer(slide);

  const goTo = useCallback((i: number) => {
    setActive(i);
    setPaused(true);
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, [slides.length, paused]);

  return (
    <section className="relative isolate overflow-hidden bg-[#111]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/uismod/hero-bg.png"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent to-[#111]" />

      <div className="relative mx-auto flex min-h-[560px] w-full max-w-[1440px] flex-col px-5 pb-16 pt-10 sm:min-h-[580px] sm:px-10 sm:pt-12 xl:min-h-[620px] xl:pb-14 xl:pt-14">
        {/*
          - <900: stack
          - 900–1279: character + date on one row
          - 1280+: copy | character | date — separate, never behind
        */}
        <div className="grid flex-1 grid-cols-1 items-center gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(260px,380px)_minmax(240px,300px)] xl:gap-6">
          {/* Copy */}
          <div className="relative z-10 order-1 max-w-xl xl:order-1 xl:pb-8">
            <h1 className="font-poster text-[clamp(2.25rem,8vw,4.5rem)] uppercase leading-[0.92] text-white">
              <span className="block sm:whitespace-nowrap">All the cells</span>
              <span className="block sm:whitespace-nowrap">are moving</span>
            </h1>
            <p className="mt-4 max-w-md text-sm font-thin leading-relaxed text-white/80 sm:mt-5 sm:text-[15px] md:text-base">
              {HERO_BLURB}
            </p>
          </div>

          <div className="order-2 flex flex-col items-center gap-6 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-center min-[900px]:gap-5 xl:contents">
            {/* Character — never absolute / never behind date */}
            <div className="pointer-events-none relative z-[5] flex shrink-0 justify-center xl:order-2 xl:h-full xl:self-end xl:justify-center">
              <div className="relative flex h-[260px] w-full max-w-[240px] items-end justify-center min-[900px]:h-[300px] min-[900px]:max-w-[280px] xl:h-full xl:max-h-[540px] xl:max-w-[380px]">
                <div className="absolute bottom-[20%] left-1/2 size-[160px] -translate-x-1/2 rounded-full bg-black/45 blur-[60px] min-[900px]:size-[200px] xl:size-[240px]" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/uismod/hero-character.png"
                  alt=""
                  className="relative h-full max-h-[260px] w-auto rotate-[6deg] object-contain object-bottom drop-shadow-[-16px_-4px_40px_rgba(0,0,0,0.55)] min-[900px]:max-h-[300px] xl:max-h-[540px]"
                />
              </div>
            </div>

            {/* Date + JOIN */}
            <div className="relative z-20 w-full max-w-full min-[900px]:max-w-[360px] xl:order-3 xl:max-w-[300px] xl:justify-self-end xl:self-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/uismod/polygon.svg"
                alt=""
                className="pointer-events-none absolute -right-2 -top-8 size-20 opacity-40 sm:-right-4 sm:-top-10 sm:size-28 md:size-32"
              />

              <div className="relative flex flex-row flex-nowrap items-end gap-2 sm:gap-3 xl:flex-col xl:items-stretch xl:gap-4">
                <div className="relative flex shrink-0 gap-2.5 border border-white/10 bg-[#111]/80 p-3 backdrop-blur-md sm:gap-3 sm:p-3.5 [clip-path:polygon(0_0,100%_0,100%_78%,88%_100%,0_100%)]">
                  <div className="flex min-w-[52px] flex-col items-center text-center font-poster sm:min-w-[64px]">
                    <p className="text-xs leading-tight text-white sm:text-sm md:text-base">
                      {slide.month}
                    </p>
                    <p className="text-[2.5rem] leading-none text-[#bef970] sm:text-[3.25rem] md:text-[4rem]">
                      {slide.day}
                    </p>
                    <p className="text-xs leading-tight text-white/50 tabular-nums sm:text-sm md:text-base">
                      {timer}
                    </p>
                  </div>

                  <div className="relative h-[60px] w-[96px] shrink-0 overflow-hidden border border-white/20 sm:h-[72px] sm:w-[118px] md:h-[84px] md:w-[137px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={slide.videoSrc}
                      src={slide.videoSrc}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/uismod/play.svg"
                      alt=""
                      className="pointer-events-none absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 sm:size-7 md:size-8"
                    />
                  </div>
                </div>

                <Link
                  href={slide.href}
                  className="arena-cta inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap pl-4 pr-8 font-poster text-sm uppercase leading-none text-[#111] sm:h-[50px] sm:gap-2 sm:pl-6 sm:pr-10 sm:text-base md:pl-8 md:pr-12 md:text-[18px] xl:w-full xl:justify-between xl:pl-6 xl:pr-6"
                >
                  JOIN EVENT
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/uismod/arrow-right.svg" alt="" className="size-4 shrink-0 sm:size-5 md:size-6" />
                </Link>
              </div>

              <p
                title={slide.title}
                className="mt-3 max-w-full truncate font-poster text-lg uppercase leading-none text-white sm:text-xl md:text-2xl"
              >
                {slide.title}
              </p>
            </div>
          </div>
        </div>

        {/* Carousel — pinned bottom-left */}
        <div
          className="absolute bottom-5 left-5 z-30 flex items-center gap-2 sm:left-10"
          role="tablist"
          aria-label="Featured events"
        >
          {slides.map((s, i) => {
            const isActive = i === active;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`Show ${s.title}`}
                onClick={() => goTo(i)}
                className={
                  isActive
                    ? 'h-2 w-8 bg-[#99ee2d] transition-all'
                    : 'size-2 bg-white/25 transition-all hover:bg-white/45'
                }
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
