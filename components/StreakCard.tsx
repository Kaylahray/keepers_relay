'use client';

import Link from 'next/link';
import { resolveCover } from '@/lib/poster';
import type { JourneySummary } from '@/types/chain';
import { ClockChip, PotChip } from '@/components/arena/ArenaPrimitives';
import { formatDistanceToNow } from 'date-fns';

export function StreakCard({
  streak,
  showCommunity = true,
}: {
  streak: JourneySummary;
  showCommunity?: boolean;
}) {
  const cover = resolveCover(streak.coverImageUrl, streak.creatureName);
  const ms = new Date(streak.expiresAt).getTime() - Date.now();
  const clock =
    streak.status !== 'alive'
      ? streak.status
      : ms <= 0
        ? 'Expired'
        : formatDistanceToNow(Date.now() + ms, { addSuffix: false }) + ' left';

  return (
    <li className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <Link
        href={`/streaks/${streak.id}`}
        className="arena-card grid grid-cols-[7.5rem_1fr] sm:grid-cols-[9.5rem_1fr]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt="" className="h-full min-h-[7rem] w-full bg-black/40 object-contain" />
        <span className="flex flex-col justify-between p-3 sm:p-4">
          <span>
            <span className="block font-poster text-lg uppercase leading-none text-white sm:text-xl">
              {streak.creatureName}
            </span>
            <span className="mt-1.5 block text-xs font-medium leading-relaxed text-white/65">
              {streak.seedPrompt}
            </span>
          </span>
          <span className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] font-bold text-white/70">
            <ClockChip label={clock} urgent={streak.status === 'alive' && ms < 2 * 3600 * 1000} />
            <PotChip amount={streak.rewardPoolCkb} pulse={Boolean(streak.stakes)} />
            {streak.stakes ? (
              <span className="rounded bg-[#af2a3a] px-1.5 py-0.5 text-[9px] uppercase text-white">
                Blitz
              </span>
            ) : null}
            <span>#{streak.holderCount}</span>
            <span>held by {streak.currentHolder}</span>
            {showCommunity && streak.communitySlug ? (
              <span className="uppercase text-white/45">{streak.communityName}</span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
