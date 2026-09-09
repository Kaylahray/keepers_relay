'use client';

import Link from 'next/link';
import { resolveCover } from '@/lib/poster';

const CARD_ART = [
  '/uismod/char-1.png',
  '/uismod/char-2.png',
  '/uismod/char-3.png',
  '/uismod/char-4.png',
];

/**
 * Uismod “Popular Tournament” card adapted for live Cells.
 * Lime plate + character art + glass footer with Join.
 */
export function LiveCellCard({
  id,
  creatureName,
  communityName,
  coverImageUrl,
  rewardPoolCkb,
  stakes,
  holderCount,
  href,
  artIndex = 0,
}: {
  id: string;
  creatureName: string;
  communityName?: string;
  coverImageUrl?: string | null;
  rewardPoolCkb: number;
  stakes?: boolean;
  holderCount?: number;
  href?: string;
  artIndex?: number;
}) {
  const art = CARD_ART[artIndex % CARD_ART.length]!;
  const cover = resolveCover(coverImageUrl, creatureName);
  const to = href ?? `/streaks/${id}`;

  return (
    <Link
      href={to}
      className="arena-card group relative block h-[380px] overflow-hidden bg-[#bef970] shadow-[-12px_0_20px_rgba(0,0,0,0.25)] sm:h-[400px]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{ backgroundImage: "url('/uismod/noise.png')", backgroundSize: '440px' }}
        aria-hidden
      />
      {/* Character / cover — full figure, bottom-right */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art}
        alt=""
        className="pointer-events-none absolute -right-4 bottom-16 h-[78%] w-auto max-w-[85%] object-contain object-bottom drop-shadow-[-12px_10px_24px_rgba(50,86,17,0.35)] transition group-hover:scale-[1.03]"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover}
        alt=""
        className="pointer-events-none absolute right-3 top-28 h-16 w-14 rounded border border-[#111]/20 bg-black/20 object-contain opacity-90"
      />

      <div className="relative z-10 p-5 pr-16">
        <h3 className="font-poster text-[2rem] uppercase leading-none text-[#111] sm:text-[2.4rem]">
          {creatureName.split(' ').slice(0, 2).map((w, i) => (
            <span key={`${w}-${i}`} className="block">
              {w}
            </span>
          ))}
        </h3>
        <p className="mt-3 text-sm font-light text-[#111]/75">
          {communityName || (stakes ? 'Blitz Cell' : 'Living Cell')}
        </p>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/uismod/card-notch.svg"
        alt=""
        className="absolute right-0 top-0 size-14"
      />

      <div className="absolute inset-x-0 bottom-0 z-10 flex h-24 items-center justify-between gap-3 bg-black/50 px-4 backdrop-blur-[8px]">
        <div className="flex gap-4 font-normal text-white">
          <div>
            <p className="text-[11px] opacity-60">Pot</p>
            <p className="text-sm font-bold">{rewardPoolCkb} CKB</p>
          </div>
          <div>
            <p className="text-[11px] opacity-60">Mode</p>
            <p className="text-sm font-bold">{stakes ? 'Stakes' : 'Open'}</p>
          </div>
          {typeof holderCount === 'number' ? (
            <div className="hidden sm:block">
              <p className="text-[11px] opacity-60">Line</p>
              <p className="text-sm font-bold">{holderCount}</p>
            </div>
          ) : null}
        </div>
        <span className="arena-cta-light inline-flex items-center gap-1 py-2 pl-5 pr-8 text-sm font-bold uppercase tracking-wide">
          Join
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/uismod/arrow-right.svg" alt="" className="size-5" />
        </span>
      </div>
    </Link>
  );
}

export function RoomFeatureCard({
  slug,
  name,
  blurb,
  coverImageUrl,
  liveStreakCount,
  memberCount,
  featured,
  isMember,
  artIndex = 0,
}: {
  slug: string;
  name: string;
  blurb: string;
  coverImageUrl?: string | null;
  liveStreakCount: number;
  memberCount: number;
  featured?: boolean;
  isMember?: boolean;
  artIndex?: number;
}) {
  const art = CARD_ART[artIndex % CARD_ART.length]!;
  const cover = resolveCover(coverImageUrl, name);

  return (
    <Link
      href={`/communities/${slug}`}
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
        className="pointer-events-none absolute -right-2 bottom-20 h-[72%] w-auto max-w-[80%] object-contain object-bottom transition group-hover:scale-[1.03]"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover}
        alt=""
        className="pointer-events-none absolute bottom-[6.5rem] left-4 h-20 w-16 border border-[#111]/15 bg-black/30 object-contain"
      />

      <div className="relative z-10 p-5">
        <h3 className="max-w-[70%] font-poster text-[2rem] uppercase leading-none text-[#111] sm:text-[2.25rem]">
          {name}
        </h3>
        <p className="mt-3 max-w-[55%] text-sm font-light text-[#111]/70 line-clamp-2">
          {blurb}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {featured ? (
            <span className="bg-[#111] px-2 py-0.5 text-[9px] font-bold uppercase text-[#99ee2d]">
              Featured
            </span>
          ) : null}
          {isMember ? (
            <span className="bg-[#111]/15 px-2 py-0.5 text-[9px] font-bold uppercase text-[#111]">
              Joined
            </span>
          ) : null}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex h-24 items-center justify-between gap-3 bg-black/50 px-4 backdrop-blur-[8px]">
        <div className="flex gap-4 text-white">
          <div>
            <p className="text-[11px] opacity-60">Live</p>
            <p className="text-sm font-bold">{liveStreakCount} Cells</p>
          </div>
          <div>
            <p className="text-[11px] opacity-60">Keepers</p>
            <p className="text-sm font-bold">{memberCount}</p>
          </div>
        </div>
        <span className="arena-cta-light inline-flex items-center py-2 pl-5 pr-8 text-sm font-bold uppercase">
          Enter
        </span>
      </div>
    </Link>
  );
}
