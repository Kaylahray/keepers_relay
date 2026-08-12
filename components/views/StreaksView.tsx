'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { StreakCard } from '@/components/StreakCard';
import { useJourneysQuery } from '@/hooks/useChain';
import type { ChainStatus } from '@/types/chain';

const FILTERS: { id: 'live' | 'all' | ChainStatus; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'all', label: 'All' },
  { id: 'returned', label: 'Home' },
  { id: 'dead', label: 'Locked' },
];

export function StreaksView() {
  const journeys = useJourneysQuery();
  const [filter, setFilter] = useState<'live' | 'all' | ChainStatus>('live');

  const list = useMemo(() => {
    const rows = journeys.data?.journeys ?? [];
    if (filter === 'all') return rows;
    if (filter === 'live') return rows.filter((j) => j.status === 'alive');
    return rows.filter((j) => j.status === filter);
  }, [journeys.data?.journeys, filter]);

  return (
    <PageShell
      eyebrow="Public board"
      title="Streaks"
      intro="Living Cells across every room."
      backHref="/communities"
      backLabel="Communities"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`border-2 border-black px-3 py-1.5 text-[10px] font-black uppercase ${
                filter === item.id ? 'bg-[#d6ff00]' : 'bg-[#fff8e7]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Link
          href="/launch"
          className="neo-button bg-[#ff4cbd] px-3 py-2 text-[10px] font-black uppercase"
        >
          Launch a streak
        </Link>
      </div>

      {journeys.isLoading ? (
        <p className="text-sm font-semibold">Loading streaks…</p>
      ) : list.length === 0 ? (
        <p className="border-[3px] border-black bg-[#fff8e7] p-4 text-sm font-semibold">
          No streaks in this filter yet.{' '}
          <Link href="/communities" className="underline">
            Pick a room
          </Link>{' '}
          and launch one.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((streak) => (
            <StreakCard key={streak.id} streak={streak} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}
