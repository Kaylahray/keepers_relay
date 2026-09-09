'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  characterFullBodyUrl,
  getCharacter,
  type CharacterId,
} from '@/lib/characters';
import { resolveCover } from '@/lib/poster';

export type BuilderCardCell = {
  id: string;
  creatureName: string;
  coverImageUrl?: string | null;
};

/**
 * Board / roster card — tall figure plate (not a cropped circle).
 */
export function BuilderCard({
  displayName,
  username,
  headline,
  characterId,
  levelLabel,
  passStreak,
  pointsBalance,
  cells = [],
  href,
  highlight,
  spin,
  exportable,
}: {
  displayName: string;
  username?: string | null;
  headline?: string | null;
  characterId?: CharacterId | string | null;
  levelLabel?: string;
  passStreak?: number;
  pointsBalance?: number;
  cells?: BuilderCardCell[];
  href?: string;
  highlight?: boolean;
  spin?: boolean;
  exportable?: boolean;
}) {
  const character = getCharacter(characterId);
  const portrait = character
    ? characterFullBodyUrl(character)
    : '/arena/keeper-razzael.png';
  const teammates = cells.slice(0, 5);
  const cardRef = useRef<HTMLElement>(null);
  const [exporting, setExporting] = useState(false);

  async function exportPng() {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#1a1628',
      });
      const a = document.createElement('a');
      a.download = `keepers-${username || displayName || 'passport'}.png`;
      a.href = dataUrl;
      a.click();
    } catch {
      window.print();
    } finally {
      setExporting(false);
    }
  }

  const inner = (
    <article
      ref={cardRef}
      className={`overflow-hidden rounded-2xl border border-white/10 bg-[#1a1628] ${
        highlight ? 'ring-2 ring-[#ff56f6]/50' : ''
      }`}
    >
      <div
        className="relative flex h-56 items-end justify-center px-3 pt-4 sm:h-64"
        style={{
          background: character
            ? `linear-gradient(180deg, ${character.fill}33, #0c0a14 85%)`
            : 'linear-gradient(180deg, #2a185033, #0c0a14 85%)',
        }}
      >
        <div
          className="pointer-events-none absolute bottom-2 h-14 w-[70%] rounded-[100%] opacity-50 blur-xl"
          style={{
            background: character
              ? `radial-gradient(ellipse, ${character.accent}aa, transparent 70%)`
              : undefined,
          }}
          aria-hidden
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={portrait}
          alt=""
          className={`relative z-10 h-full w-auto max-w-full object-contain object-bottom ${
            spin ? 'hero-spin' : ''
          }`}
        />
      </div>

      <div className="space-y-3 px-4 pb-4 pt-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">
            {levelLabel ?? (character ? character.title : 'Keeper')}
          </p>
          <h3 className="truncate font-poster text-xl uppercase leading-none text-white">
            {username ? `@${username}` : displayName}
          </h3>
          <p className="mt-1 truncate text-xs font-medium text-white/55">
            {headline || character?.tagline || 'Take it. Mark it. Pass it on.'}
          </p>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-[9px] font-bold uppercase text-white/40">
            <span>Pass streak</span>
            <span>{passStreak ?? 0}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#ff56f6] to-[#406aff]"
              style={{ width: `${Math.min(100, ((passStreak ?? 0) / 20) * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] font-bold uppercase text-white/40">Cells in the line</p>
            <div className="mt-1.5 flex -space-x-2">
              {teammates.length === 0 ? (
                <span className="text-[10px] text-white/35">None yet</span>
              ) : (
                teammates.map((cell) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={cell.id}
                    src={resolveCover(cell.coverImageUrl, cell.creatureName)}
                    alt=""
                    className="h-8 w-8 rounded-lg border border-[#1a1628] bg-black/40 object-contain"
                  />
                ))
              )}
            </div>
          </div>
          {typeof pointsBalance === 'number' ? (
            <span className="rounded bg-white/10 px-2 py-1 font-mono text-[10px] font-bold text-[#e1bf47]">
              {pointsBalance} pts
            </span>
          ) : null}
        </div>

        {exportable ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void exportPng();
            }}
            disabled={exporting}
            className="arena-cta w-full rounded px-3 py-2.5 text-[10px] font-bold uppercase disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export passport card'}
          </button>
        ) : null}
      </div>
    </article>
  );

  if (href && !exportable) {
    return (
      <Link href={href} className="arena-card block">
        {inner}
      </Link>
    );
  }
  return <div className="arena-card">{inner}</div>;
}
