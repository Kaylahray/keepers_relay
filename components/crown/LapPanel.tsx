'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { LapBoxes } from '@/components/ui/kit';

type Props = {
  /** The laps locked so far: the run's score after each, and whether it crashed there. */
  laps: { score: number; crashed: boolean }[];
  /** How many laps a full run has. */
  total: number;
  lapWord: 'lap' | 'floor';
  /** The score of a crashed lap that was never locked. */
  crashScore: number | null;
  /** The upgrades or relics the run holds. */
  strip: ReactNode;
  /** Locked picks the run ended before using. */
  unused: string | null;
  toBeat: number;
  runOver: boolean;
  /** A lap landed after its window, so the run stopped there. */
  late: boolean;
  /** The entry's run was started in another browser, which holds its session key and moves. */
  otherDevice: boolean;
  /** The screen that continues the run. Null when there is nothing to continue. */
  onOpen: (() => void) | null;
  openLabel: string;
};

/** Where the player's run stands on the crown page. The run itself plays on the full screen. */
export function LapPanel({ laps, total, lapWord, crashScore, strip, unused, toBeat, runOver, late, otherDevice, onOpen, openLabel }: Props) {
  const score = crashScore ?? laps.at(-1)?.score ?? 0;
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-wider text-lime">{runOver ? 'Your run' : 'Run in progress'}</p>
      <div className="mt-3">
        <LapBoxes
          label={`Your ${lapWord}s`}
          states={Array.from({ length: total }, (_, index) => {
            const locked = laps.at(index);
            if (locked) return locked.crashed ? 'crash' : 'done';
            if (crashScore != null) return index === laps.length ? 'crash' : 'empty';
            return index === laps.length && !runOver ? 'current' : 'empty';
          })}
          scores={laps.map((lap) => lap.score)}
        />
      </div>
      <p className="mt-3 font-poster text-3xl font-black tabular-nums">
        {score} <span className="text-lg text-mute">vs {toBeat}</span>
      </p>
      <div className="mt-3">
        {strip}
      </div>
      {runOver && unused ? <p className="mt-3 text-xs text-mute">{unused}</p> : null}
      {otherDevice ? (
        <p className="mt-4 text-sm text-mute">This entry&apos;s run was started in another browser, which holds its {lapWord}s. Finish it there, or pay a new entry here.</p>
      ) : late ? (
        <p className="mt-3 text-sm text-mute">Your last {lapWord} landed after its time was up, so this run stopped there and can&apos;t take the crown. Your entry comes back after the game, or pay a new one for a fresh run.</p>
      ) : runOver && score <= toBeat ? (
        <p className="mt-3 text-sm text-mute">Your run is over and the crown still stands. Your entry comes back after the game, or pay a new one for a fresh run.</p>
      ) : null}
      {onOpen ? (
        <Button variant="lime" size="xl" block className="mt-4" onClick={onOpen}>
          {openLabel}
        </Button>
      ) : null}
    </div>
  );
}
