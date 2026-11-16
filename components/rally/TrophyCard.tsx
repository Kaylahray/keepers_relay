'use client';

import Link from 'next/link';
import { ckbWhole } from '@/hooks/useRallyStats';
import { IMG } from '@/lib/crowns/art';
import { mapName, RALLY } from '@/lib/rally/rules';
import type { Trophy } from '@/lib/rally/trophy';

const MAP_TONES = ['#99ee2d', '#ff56f6', '#e1bf47'];

/** The crown drawn for a trophy, in its map's colour. */
export function TrophyCrown({ map, size = 64 }: { map: number; size?: number }) {
  const jewel = MAP_TONES[map] ?? '#99ee2d';
  return (
    <svg viewBox="0 0 120 130" width={size} height={size} role="img" aria-label="Crown trophy">
      <path d="M22 30 L38 52 L60 22 L82 52 L98 30 L92 78 H28 Z" fill="#e1bf47" />
      <circle cx="22" cy="28" r="6" fill="#e1bf47" />
      <circle cx="60" cy="18" r="6" fill="#e1bf47" />
      <circle cx="98" cy="28" r="6" fill="#e1bf47" />
      <rect x="28" y="80" width="64" height="9" rx="2" fill="#9a7f22" />
      <rect x="52" y="89" width="16" height="22" fill="#9a7f22" />
      <rect x="34" y="111" width="52" height="14" rx="3" fill="#2d2d2d" />
      <circle cx="60" cy="58" r="8" fill={jewel} />
    </svg>
  );
}

export function raceTime(ticks: number): string {
  return `${(ticks / RALLY.TICK_HZ).toFixed(2)} s`;
}

/** One trophy on a profile shelf; links to the race it was won in when its match is known. */
export function TrophyCard({ trophy, matchId }: { trophy: Trophy; matchId?: string }) {
  const body = (
    <>
      <span className="relative block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG.trophy} alt="Gold crown trophy" className="aspect-square w-full object-cover" />
        <span className="absolute left-3 top-3">
          <TrophyCrown map={trophy.map} size={36} />
        </span>
      </span>
      <span className="flex flex-1 flex-col p-4">
        <span className="font-display text-2xl font-black uppercase leading-none">{mapName(trophy.map)}</span>
        <span className="mt-1 font-display text-lg font-extrabold text-gold">1st of {trophy.cars}</span>
        <span className="mt-auto flex justify-between gap-2 pt-3 text-sm">
          <span className="tabular-nums text-chalk/80">{raceTime(trophy.ticks)}</span>
          <span className="font-semibold text-gold">{ckbWhole(trophy.pot).toLocaleString('en-US')} CKB pot</span>
        </span>
      </span>
    </>
  );
  const style = 'flex h-full flex-col overflow-hidden rounded-3xl border border-gold/30 bg-black text-left';
  return matchId ? (
    <Link href={`/rally/${matchId}`} className={`${style} transition-colors duration-150 hover:border-gold`}>
      {body}
    </Link>
  ) : (
    <div className={style}>{body}</div>
  );
}
