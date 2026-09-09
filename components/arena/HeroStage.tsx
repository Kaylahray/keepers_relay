'use client';

import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  characterFullBodyUrl,
  getCharacter,
  type CharacterId,
  CHARACTERS,
} from '@/lib/characters';
import { resolveCover } from '@/lib/poster';

export type HeroStageCell = {
  id: string;
  creatureName: string;
  coverImageUrl?: string | null;
};

/**
 * Hero-select stage (Razzael / COD vibe): tall full-body figure,
 * glass lore + stats beside it. Spin + export on private passport.
 */
export function HeroStage({
  displayName,
  username,
  headline,
  characterId,
  levelLabel,
  passStreak,
  pointsBalance,
  cells = [],
  spin,
  exportable,
  privateBits,
}: {
  displayName: string;
  username?: string | null;
  headline?: string | null;
  characterId?: CharacterId | string | null;
  levelLabel?: string;
  passStreak?: number;
  pointsBalance?: number;
  cells?: HeroStageCell[];
  spin?: boolean;
  exportable?: boolean;
  /** Owner-only rows (wallet, notices link, etc.) */
  privateBits?: ReactNode;
}) {
  const character =
    getCharacter(characterId) ?? CHARACTERS[0];
  const art = characterFullBodyUrl(character);
  const stageRef = useRef<HTMLElement>(null);
  const [exporting, setExporting] = useState(false);

  async function exportPng() {
    if (!stageRef.current || exporting) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(stageRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#0c0a14',
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

  return (
    <section
      ref={stageRef}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0c0a14]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 35% 70%, ${character.accent}33, transparent 70%),
            linear-gradient(180deg, #15121d 0%, #0c0a14 55%, #1a1028 100%)`,
        }}
        aria-hidden
      />

      <div className="relative grid items-end gap-6 p-4 sm:p-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
        {/* Full-body figure — no crop circle, no card border */}
        <div className="relative mx-auto flex h-[380px] w-full max-w-md items-end justify-center sm:h-[460px] lg:h-[520px]">
          <div
            className="pointer-events-none absolute bottom-4 h-24 w-[70%] rounded-[100%] opacity-60 blur-2xl"
            style={{
              background: `radial-gradient(ellipse, ${character.accent}aa, transparent 70%)`,
            }}
            aria-hidden
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art}
            alt=""
            className={`relative z-10 h-full w-auto max-w-full object-contain object-bottom drop-shadow-[0_12px_40px_rgba(0,0,0,0.65)] ${
              spin ? 'hero-spin' : ''
            }`}
          />
        </div>

        {/* Glass panel — name, lore, public stats */}
        <div className="relative z-10 mb-2 space-y-4 rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-md lg:mb-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
              {levelLabel ?? character.title}
            </p>
            <h2 className="mt-1 font-poster text-3xl uppercase leading-none text-white sm:text-4xl">
              {username ? `@${username}` : displayName}
            </h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-white/70">
              {headline || character.tagline}
            </p>
            <p className="mt-1 font-mono text-[10px] font-bold uppercase text-white/40">
              Cast · {character.name}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Pass streak" value={String(passStreak ?? 0)} />
            {typeof pointsBalance === 'number' ? (
              <Stat label="Balance" value={String(pointsBalance)} accent />
            ) : (
              <Stat label="Cells" value={String(cells.length)} />
            )}
          </div>

          {cells.length > 0 ? (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/40">
                Cells in the line
              </p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {cells.slice(0, 6).map((cell) => (
                  <Link
                    key={cell.id}
                    href={`/streaks/${cell.id}`}
                    className="shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveCover(cell.coverImageUrl, cell.creatureName)}
                      alt=""
                      className="h-14 w-12 rounded-lg border border-white/10 bg-black/40 object-contain"
                      title={cell.creatureName}
                    />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {privateBits}

          {exportable ? (
            <button
              type="button"
              onClick={() => void exportPng()}
              disabled={exporting}
              className="arena-cta w-full rounded px-3 py-2.5 text-[10px] font-bold uppercase disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export hero card'}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
      <p
        className={`font-poster text-2xl uppercase leading-none ${
          accent ? 'text-[#e1bf47]' : 'text-white'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[9px] font-bold uppercase text-white/40">{label}</p>
    </div>
  );
}
