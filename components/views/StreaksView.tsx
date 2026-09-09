'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaRailCard, ArenaStage } from '@/components/arena/ArenaStage';
import { LiveCellCard } from '@/components/arena/UismodCards';
import { useJourneysQuery } from '@/hooks/useChain';
import { resolveCover } from '@/lib/poster';
import type { ChainStatus } from '@/types/chain';

const FILTERS: { id: 'live' | 'blitz' | 'archive' | 'all' | ChainStatus; label: string }[] = [
  { id: 'live', label: 'Still alive' },
  { id: 'blitz', label: 'Blitz pots' },
  { id: 'archive', label: 'Archives' },
  { id: 'all', label: 'All' },
  { id: 'returned', label: 'Made it home' },
  { id: 'dead', label: 'Died' },
];

export function StreaksView() {
  const journeys = useJourneysQuery();
  const search = useSearchParams();
  const kindParam = search.get('kind');
  const [filter, setFilter] = useState<'live' | 'blitz' | 'archive' | 'all' | ChainStatus>(
    kindParam === 'blitz' ? 'blitz' : kindParam === 'archive' ? 'archive' : 'live',
  );

  const all = journeys.data?.journeys ?? [];

  const list = useMemo(() => {
    const rows = [...all];
    rows.sort((a, b) => {
      const stakesScore = (b.stakes ? 1 : 0) - (a.stakes ? 1 : 0);
      if (stakesScore !== 0) return stakesScore;
      return b.rewardPoolCkb - a.rewardPoolCkb;
    });
    if (filter === 'all') return rows;
    if (filter === 'live') return rows.filter((j) => j.status === 'alive');
    if (filter === 'blitz') return rows.filter((j) => j.status === 'alive' && j.stakes);
    if (filter === 'archive') return rows.filter((j) => j.status === 'alive' && !j.stakes);
    return rows.filter((j) => j.status === filter);
  }, [all, filter]);

  const featured = useMemo(() => {
    const alive = all.filter((j) => j.status === 'alive');
    return [...alive]
      .sort((a, b) => {
        const stakesScore = (b.stakes ? 1 : 0) - (a.stakes ? 1 : 0);
        if (stakesScore !== 0) return stakesScore;
        return b.rewardPoolCkb - a.rewardPoolCkb;
      })
      .slice(0, 4);
  }, [all]);

  const liveCount = all.filter((j) => j.status === 'alive').length;
  const blitzCount = all.filter((j) => j.status === 'alive' && j.stakes).length;

  return (
    <ArenaStage backHref="/events" backLabel="Events">
      <section className="grid items-end gap-8 lg:grid-cols-[1fr_auto_minmax(260px,320px)] lg:gap-0">
        <div className="relative z-10 max-w-xl pb-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
            Chain / Archive
          </p>
          <h1 className="mt-3 font-poster text-[clamp(2.75rem,6vw,4.5rem)] uppercase leading-[0.9] text-white">
            Chain
            <br />
            Cells
          </h1>
          <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/60">
            Living Cells that move keeper to keeper. Anyone can browse. Join a room to play —
            open a Cell to take your turn.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 font-mono text-[10px] font-bold uppercase">
            <span className="border border-[#99ee2d]/40 bg-[#99ee2d]/10 px-2 py-1 text-[#99ee2d]">
              {liveCount} alive
            </span>
            <span className="border border-white/15 px-2 py-1 text-white/70">
              {blitzCount} blitz
            </span>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ArenaCta href="/launch">Launch a Chain Cell</ArenaCta>
            <Link
              href="/events"
              className="border-b border-[#bef970] pb-1 text-sm font-bold uppercase tracking-wide text-white"
            >
              Live events →
            </Link>
            <Link
              href="/communities"
              className="border-b border-white/30 pb-1 text-sm font-bold uppercase tracking-wide text-white/70"
            >
              Rooms →
            </Link>
          </div>
        </div>

        <div className="relative mx-auto hidden h-[min(52vh,460px)] w-[260px] shrink-0 lg:block xl:w-[300px]">
          <div
            className="pointer-events-none absolute left-1/2 top-1/4 h-56 w-56 -translate-x-1/2 rounded-full bg-[#a855f7]/35 blur-[70px]"
            aria-hidden
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/uismod/char-1.png"
            alt=""
            className="relative z-10 h-full w-full object-contain object-bottom drop-shadow-[0_0_40px_rgba(168,85,247,0.4)]"
          />
        </div>

        <aside className="relative z-10 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div
            className="pointer-events-none absolute left-0 top-8 hidden h-[75%] w-px bg-gradient-to-b from-[#99ee2d] via-[#a855f7] to-transparent lg:block"
            aria-hidden
          />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
            Hot Cells
          </p>
          <p className="mt-1 text-xs text-white/45">Open to play the turn</p>
          <ul className="mt-4 space-y-2.5">
            {journeys.isLoading ? (
              <li className="flex items-center gap-2 text-sm text-white/45">
                <Loader2 className="h-4 w-4 animate-spin" /> Scanning…
              </li>
            ) : featured.length === 0 ? (
              <li className="text-sm text-white/50">Nothing alive — launch one.</li>
            ) : (
              featured.map((cell) => (
                <li key={cell.id}>
                  <ArenaRailCard
                    href={`/streaks/${cell.id}`}
                    eyebrow={cell.stakes ? 'Blitz' : 'Chain'}
                    title={cell.creatureName}
                    meta={`${cell.communityName ?? 'Room'} · ${cell.rewardPoolCkb} CKB`}
                    cover={resolveCover(cell.coverImageUrl, cell.creatureName)}
                    cta="Open"
                  />
                </li>
              ))
            )}
          </ul>
        </aside>
      </section>

      <section className="relative z-10 mt-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-poster text-3xl uppercase text-white sm:text-4xl">Board</h2>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${
                  filter === item.id
                    ? 'bg-[#99ee2d] text-[#111]'
                    : 'border border-white/15 bg-black/40 text-white/70 hover:bg-white/10'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {journeys.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-white/55">
            <Loader2 className="h-4 w-4 animate-spin" /> Looking for live Cells…
          </p>
        ) : list.length === 0 ? (
          <p className="border border-white/10 bg-black/40 p-5 text-sm text-white/70">
            Nothing here yet.{' '}
            <Link href="/communities" className="text-[#99ee2d] underline">
              Pick a room
            </Link>{' '}
            and send one out.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((streak, i) => (
              <li key={streak.id}>
                <LiveCellCard
                  id={streak.id}
                  creatureName={streak.creatureName}
                  communityName={streak.communityName}
                  coverImageUrl={streak.coverImageUrl}
                  rewardPoolCkb={streak.rewardPoolCkb}
                  stakes={Boolean(streak.stakes)}
                  holderCount={streak.holderCount}
                  artIndex={i}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </ArenaStage>
  );
}
