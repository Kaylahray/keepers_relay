'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LapBoxes, type LapState } from '@/components/ui/kit';
import { RoadArt, UpgradeArt } from '@/components/game/RunArt';
import { CROWN_RUN, DANGER, DANGER_BONUS, UPGRADES, hasUpgrade } from '@/lib/game/crown-run';

/** A run fills the screen on every device, like a game app, from the first lap to the summary. */
export function RunLayer({ children }: { children: ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-ink text-white" style={{ height: '100dvh' }}>
      {children}
    </div>,
    document.body,
  );
}

/** The upgrades a run holds, as small pictures with their names. */
export function UpgradeStrip({ owned }: { owned: number }) {
  const owns = UPGRADES.filter((upgrade) => hasUpgrade(owned, upgrade.id));
  if (owns.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Your upgrades">
      {owns.map((upgrade) => (
        <li key={upgrade.id} className="w-20 overflow-hidden rounded-lg bg-ink-3">
          <span className="block aspect-[3/2]">
            <UpgradeArt id={upgrade.id} />
          </span>
          <span className="block truncate px-1.5 py-1 text-center text-[10px] font-semibold">{upgrade.name}</span>
        </li>
      ))}
    </ul>
  );
}

/** The screen between laps: where the run stands and what the next lap will be. */
export function NextLap({
  lap,
  score,
  owned,
  road,
  aside,
  children,
}: {
  /** The lap coming up, by its index from zero. */
  lap: number;
  score: number;
  owned: number;
  road: number;
  /** What the mode adds: the crown's standing, say. */
  aside?: ReactNode;
  /** The buttons. */
  children: ReactNode;
}) {
  const states: LapState[] = Array.from({ length: CROWN_RUN.LAPS }, (_, i) => (i < lap ? 'done' : i === lap ? 'current' : 'empty'));
  const danger = road === DANGER;
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto px-4 pb-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
      <div className="relative aspect-[3/1] w-full shrink-0 overflow-hidden rounded-2xl">
        <RoadArt road={road} />
      </div>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-mute">Next: lap {lap + 1} of {CROWN_RUN.LAPS}</p>
      <h2 className={`mt-1 font-poster text-3xl font-black uppercase ${danger ? 'text-danger' : 'text-lime'}`}>{danger ? 'Danger road' : 'Safe road'}</h2>
      {danger ? <p className="mt-1 text-sm text-mute">Finish this lap for +{DANGER_BONUS[lap]} points. Blocks marked in red will slide into that lane.</p> : null}
      <div className="mt-4">
        <LapBoxes states={states} label="Your laps" />
      </div>
      <dl className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <dt className="text-sm text-mute">Your score</dt>
          <dd className="font-poster text-2xl font-black tabular-nums">{score}</dd>
        </div>
      </dl>
      <div className="mt-3">
        <UpgradeStrip owned={owned} />
      </div>
      {aside}
      <div className="mt-auto space-y-2 pt-4">{children}</div>
    </div>
  );
}

export type LapLine = { score: number; road: number; upgrade: number | null };

/** The end of a run: the score, each lap's picks and points, and what the mode adds. */
export function RunSummary({
  title,
  score,
  crashedLap,
  coins,
  owned,
  lines,
  unused,
  note,
  children,
}: {
  title: string;
  score: number;
  /** The lap the run crashed on, by its index from zero. */
  crashedLap?: number | null;
  coins: number;
  owned: number;
  /** One per lap played. */
  lines: LapLine[];
  /** Locked picks the run ended before using. */
  unused?: string | null;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto px-4 pb-4" style={{ paddingTop: 'max(24px, env(safe-area-inset-top))' }}>
      <p className={`font-mono text-[11px] uppercase tracking-wider ${crashedLap != null ? 'text-danger' : 'text-lime'}`}>{title}</p>
      <p className="mt-1 font-poster text-6xl font-black tabular-nums">{score}</p>
      <p className="mt-1 text-sm text-mute">{coins} coins</p>
      <div className="mt-4">
        <UpgradeStrip owned={owned} />
      </div>
      <table className="mt-4 w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Lap</th>
            <th>Road</th>
            <th>Picked after</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="border-t border-white/5">
              <td className="py-2 font-mono text-xs text-mute">Lap {i + 1}{crashedLap === i ? ' ✕' : ''}</td>
              <td className={`py-2 text-xs font-semibold ${line.road === DANGER ? 'text-danger' : 'text-lime'}`}>{line.road === DANGER ? 'Danger' : 'Safe'}</td>
              <td className="py-2 text-xs text-mute">{line.upgrade != null ? `+ ${UPGRADES[line.upgrade]!.name}` : ''}</td>
              <td className="py-2 text-right font-mono tabular-nums">{line.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {unused ? <p className="mt-3 text-xs text-mute">{unused}</p> : null}
      {note}
      <div className="mt-auto space-y-2 pt-4">{children}</div>
    </div>
  );
}
