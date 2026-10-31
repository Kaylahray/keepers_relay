'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ART } from '@/lib/art';
import { getCkbClient } from '@/lib/ckb/client';
import { fetchCrownList } from '@/lib/crown/remote';
import { listDuels } from '@/lib/duel/chain';
import { STATUS_OPEN } from '@/lib/duel/codec';
import { duelsConfigured } from '@/lib/registry/config';

type GameTile = { name: string; mode: string; body: string; img: string; href: string; tone: 'lime' | 'pink'; cta: string };

const GAMES: GameTile[] = [
  { name: 'Lane runner', mode: 'Crowns', body: '5 laps. Dodge the blocks, grab the coins.', img: ART.laneRace, href: '/play', tone: 'lime', cta: 'Find a crown' },
  { name: 'Artillery', mode: 'Duels', body: 'Take turns firing over the tower. Read the wind.', img: ART.artillery, href: '/duels/new?game=artillery', tone: 'pink', cta: 'Challenge' },
  { name: 'Lane race', mode: 'Duels', body: 'Same 5 laps for both. Higher score wins.', img: ART.laneRace, href: '/duels/new?game=race', tone: 'pink', cta: 'Challenge' },
];

/** The front door to playing: two modes, then the games inside them. */
export function PlayHub() {
  const [counts, setCounts] = useState<{ crowns: number; duels: number } | null>(null);

  useEffect(() => {
    let stop = false;
    void Promise.all([
      fetchCrownList().catch(() => []),
      duelsConfigured() ? listDuels(getCkbClient(), 30).catch(() => []) : Promise.resolve([]),
    ]).then(([rooms, duels]) => {
      if (stop) return;
      setCounts({ crowns: rooms.filter((r) => r.status === 'live').length, duels: duels.filter((d) => d.duel.status === STATUS_OPEN).length });
    });
    return () => {
      stop = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-6 md:px-8 md:pt-12">
      <h1 className="font-poster text-3xl font-black uppercase md:text-5xl">Pick a mode</h1>
      <p className="mt-2 text-mute">Two doors into the same arcade. Either way, the chain replays every game before anyone is paid.</p>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <ModeDoor href="/play" img={ART.crowns} tone="lime" count={counts ? `${counts.crowns} live now` : 'Live crowns'} title="Crowns" line="Many players. Hold it at zero." />
        <ModeDoor href="/duels" img={ART.duels} tone="pink" count={counts ? `${counts.duels} open challenges` : 'Open challenges'} title="Duels" line="You vs one player. Winner takes both." />
      </div>

      <h2 className="mt-16 font-poster text-xl font-extrabold uppercase md:text-2xl">The games</h2>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((g) => (
          <li key={g.name} className="flex flex-col overflow-hidden rounded-2xl bg-ink-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.img} alt="" className="aspect-video w-full object-cover" />
            <div className="flex flex-1 flex-col p-5">
              <p className={`font-mono text-[10px] font-bold uppercase tracking-wider ${g.tone === 'lime' ? 'text-lime' : 'text-pink'}`}>{g.mode}</p>
              <h3 className="mt-1 font-poster text-lg font-bold uppercase">{g.name}</h3>
              <p className="mt-1 text-sm text-mute">{g.body}</p>
              <div className="mt-auto pt-5">
                <Button href={g.href} variant={g.tone}>
                  {g.cta}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Who to play: the players list, one tap from here (on phones it is not in the tab bar). */}
      <Link
        href="/players"
        className="clip-panel mt-10 flex items-center gap-4 bg-ink-2 p-5 transition-colors duration-150 hover:bg-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white md:p-7"
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-pink text-ink">
          <Users className="h-7 w-7" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-poster text-xl font-black uppercase">Players</span>
          <span className="block text-sm text-mute">See who is here, their wins and winnings, and challenge one of them.</span>
        </span>
        <ArrowRight className="h-6 w-6 shrink-0 text-pink" aria-hidden="true" />
      </Link>
    </div>
  );
}

function ModeDoor({ href, img, tone, count, title, line }: { href: string; img: string; tone: 'lime' | 'pink'; count: string; title: string; line: string }) {
  return (
    <Link href={href} className={`clip-panel group relative block overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${tone === 'lime' ? 'bg-lime' : 'bg-pink'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt="" className="aspect-[16/10] w-full object-cover transition-transform duration-300 ease-snap group-hover:scale-[1.03]" />
      <div className="flex items-end justify-between gap-4 p-5 text-ink md:p-7">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider">{count}</p>
          <h2 className="font-poster text-4xl font-black uppercase md:text-5xl">{title}</h2>
          <p className="mt-1 font-medium">{line}</p>
        </div>
        <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ink ${tone === 'lime' ? 'text-lime' : 'text-pink'}`}>
          <ArrowRight className="h-6 w-6" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
