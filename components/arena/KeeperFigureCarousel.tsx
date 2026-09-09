'use client';

import Link from 'next/link';
import type { Owner } from '@/types/chain';
import { CHARACTERS, characterFullBodyUrl } from '@/lib/characters';

/**
 * COD-style cast line — tall full-body figures, no card chrome.
 * Order = lineage. Scrolls horizontally as the Cell grows.
 */
export function KeeperFigureCarousel({
  owners,
  currentIsDead,
}: {
  owners: Owner[];
  currentIsDead?: boolean;
}) {
  if (owners.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-poster text-xl uppercase text-white">The line</h3>
          <p className="mt-1 text-xs font-medium text-white/55">
            Full cast — every Keeper who held it, first to latest.
          </p>
        </div>
        <span className="font-mono text-[10px] font-bold text-white/40">
          {owners.length} Keepers
        </span>
      </div>
      <div className="-mx-2 flex items-end gap-1 overflow-x-auto px-2 pb-2 pt-4 [scrollbar-width:thin]">
        {owners.map((owner, index) => {
          const isCurrent = index === owners.length - 1;
          const character = CHARACTERS[index % CHARACTERS.length];
          const art = characterFullBodyUrl(character);
          const href = owner.address
            ? `/profile/${encodeURIComponent(owner.address)}`
            : owner.name.startsWith('@')
              ? `/u/${owner.name.slice(1)}`
              : `/profile/${encodeURIComponent(owner.name.toLowerCase())}`;

          return (
            <Link
              key={owner.id}
              href={href}
              className="group relative flex w-[130px] shrink-0 flex-col items-center sm:w-[160px]"
            >
              <div
                className={`relative flex h-[340px] w-full items-end justify-center sm:h-[420px] ${
                  isCurrent && !currentIsDead ? 'drop-shadow-[0_0_28px_rgba(255,86,246,0.45)]' : ''
                }`}
              >
                <div
                  className="pointer-events-none absolute bottom-0 h-16 w-full rounded-[100%] opacity-50 blur-md"
                  style={{
                    background: `radial-gradient(ellipse, ${character.accent}cc, transparent 70%)`,
                  }}
                  aria-hidden
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={art}
                  alt=""
                  className="relative z-10 h-full w-auto max-w-full object-contain object-bottom transition group-hover:scale-[1.04]"
                />
                <span className="absolute left-1 top-1 z-20 font-mono text-[10px] font-bold text-white/70">
                  #{index + 1}
                </span>
              </div>
              <p className="mt-2 w-full truncate text-center text-[11px] font-bold uppercase text-white group-hover:text-[#ff56f6]">
                {owner.name}
              </p>
              {isCurrent && !currentIsDead ? (
                <span className="text-[8px] font-bold uppercase tracking-wider text-[#ff56f6]">
                  Holding
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
