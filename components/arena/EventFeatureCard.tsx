'use client';

import Link from 'next/link';
import type { EventSummary } from '@/types/event';
import { EVENT_MODE_LABEL } from '@/types/event';

const CARD_ART = [
  '/uismod/char-1.png',
  '/uismod/char-2.png',
  '/uismod/char-3.png',
  '/uismod/char-4.png',
];

export function EventFeatureCard({
  event,
  artIndex = 0,
}: {
  event: EventSummary;
  artIndex?: number;
}) {
  const art = CARD_ART[artIndex % CARD_ART.length]!;
  const href =
    event.status === 'live'
      ? `/events/${event.id}/live`
      : event.status === 'settled' || event.status === 'finished'
        ? `/events/${event.id}/results`
        : `/events/${event.id}`;

  return (
    <Link
      href={href}
      className="arena-card group relative block h-[380px] overflow-hidden bg-[#bef970] shadow-[-12px_0_20px_rgba(0,0,0,0.25)] sm:h-[400px]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{ backgroundImage: "url('/uismod/noise.png')", backgroundSize: '440px' }}
        aria-hidden
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art}
        alt=""
        className="pointer-events-none absolute -right-4 bottom-16 h-[78%] w-auto max-w-[85%] object-contain object-bottom transition group-hover:scale-[1.03]"
      />

      <div className="relative z-10 p-5 pr-16">
        <p className="font-mono text-[10px] font-bold uppercase text-[#111]/60">
          {EVENT_MODE_LABEL[event.mode]} · {event.status}
        </p>
        <h3 className="mt-2 font-poster text-[1.75rem] uppercase leading-none text-[#111] sm:text-[2.1rem]">
          {event.name}
        </h3>
        <p className="mt-3 line-clamp-2 text-sm font-light text-[#111]/75">
          {event.description}
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex h-24 items-center justify-between gap-3 bg-black/50 px-4 backdrop-blur-[8px]">
        <div className="flex gap-4 text-white">
          <div>
            <p className="text-[11px] opacity-60">Pot</p>
            <p className="text-sm font-bold">{event.pot} CKB</p>
          </div>
          <div>
            <p className="text-[11px] opacity-60">Entry</p>
            <p className="text-sm font-bold">
              {event.entryFee ? `${event.entryFee} CKB` : 'Free'}
            </p>
          </div>
          <div>
            <p className="text-[11px] opacity-60">Players</p>
            <p className="text-sm font-bold">
              {event.playerCount}/{event.maxPlayers}
            </p>
          </div>
        </div>
        <span className="arena-cta-light inline-flex items-center py-2 pl-5 pr-8 text-sm font-bold uppercase">
          {event.status === 'live' ? 'Play' : 'Join'}
        </span>
      </div>
    </Link>
  );
}
