'use client';

import Link from 'next/link';
import { resolveCover } from '@/lib/poster';
import type { JourneySummary } from '@/types/chain';

export function StreakCard({
  streak,
  showCommunity = true,
}: {
  streak: JourneySummary;
  showCommunity?: boolean;
}) {
  const cover = resolveCover(streak.coverImageUrl, streak.creatureName);
  return (
    <li className="border-[3px] border-black bg-[#fff8e7]">
      <Link href={`/streaks/${streak.id}`} className="grid grid-cols-[7.5rem_1fr] sm:grid-cols-[9.5rem_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt="" className="h-full min-h-[7rem] w-full object-cover" />
        <span className="flex flex-col justify-between p-3 sm:p-4">
          <span>
            <span className="block font-black uppercase leading-none">{streak.creatureName}</span>
            <span className="mt-1.5 block text-xs font-semibold leading-relaxed text-black/75">
              {streak.seedPrompt}
            </span>
          </span>
          <span className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] font-bold">
            <span className="border-2 border-black bg-white px-1.5 py-0.5 uppercase">
              {streak.status}
            </span>
            <span>#{streak.holderCount}</span>
            <span>held by {streak.currentHolder}</span>
            {showCommunity && streak.communitySlug ? (
              <span className="uppercase">{streak.communityName}</span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
