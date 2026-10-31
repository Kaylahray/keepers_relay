'use client';

import { ChainLoader } from '@/components/arena/ChainLoader';
import { Button } from '@/components/ui/Button';
import { LapBoxes } from '@/components/ui/kit';
import { LAPS } from '@/lib/sudden-death/codec';

type Props = {
  /** The laps sealed so far: the run's score after each, and whether it crashed there. */
  laps: { score: number; crashed: boolean }[];
  /** The lap being played now, counted from 1. */
  current: number;
  /** The best clean try at the current lap, if any. */
  cleanScore: number | null;
  /** The best crashed try, only while it beats the best clean one. Sealing it ends the run. */
  crashScore: number | null;
  toBeat: number;
  runOver: boolean;
  /** Waiting for the chain: the entry to land ('entry') or the last seal to land ('seal'). */
  pitStop: 'entry' | 'seal' | null;
  /** The entry's run was started in another browser, which holds its session key and moves. */
  otherDevice: boolean;
  waitedSeconds: number | null;
  /** How long is left to send a grab that still counts. */
  windowLeft: number | null;
  busy: boolean;
  onSeal: (kind: 'clean' | 'crash') => void;
  formatWait: (ms: number) => string;
};

/** Where the player's run stands, lap by lap: the five laps across the top, then the pit stop while the chain forges the next lap, the lap being raced with its seal button, or the finished run. */
export function LapPanel({
  laps,
  current,
  cleanScore,
  crashScore,
  toBeat,
  runOver,
  pitStop,
  otherDevice,
  waitedSeconds,
  windowLeft,
  busy,
  onSeal,
  formatWait,
}: Props) {
  const runScore = laps.at(-1)?.score ?? 0;
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-wider text-lime">Run in progress</p>
      <div className="mt-3">
        <LapBoxes
          label="Your laps"
          states={Array.from({ length: LAPS }, (_, index) => {
            const sealed = laps.at(index);
            if (sealed) return sealed.crashed ? 'crash' : 'done';
            return index + 1 === current && !runOver ? 'current' : 'empty';
          })}
          scores={laps.map((lap) => lap.score)}
        />
      </div>
      <p className="mt-3 text-sm text-mute">
        {runScore} so far · beat {toBeat}
      </p>

      {otherDevice ? (
        <p className="mt-4 text-sm text-mute">
          This entry&apos;s run was started in another browser, which holds its laps. Finish it there, or pay a new entry here.
        </p>
      ) : pitStop ? (
        <div className="mt-4 rounded-2xl bg-ink">
          <ChainLoader
            compact
            title={pitStop === 'entry' ? 'Confirming your entry…' : `Pit stop · forging lap ${laps.length + 1}${waitedSeconds != null ? ` · ${waitedSeconds}s` : ''}`}
            note={
              pitStop === 'entry'
                ? 'Lap 1’s road appears the moment it lands.'
                : `Lap ${laps.length} is sealed. The next road comes from the block your seal lands in. Nobody, not even you, has seen it yet.`
            }
          />
        </div>
      ) : runOver ? (
        <div className="mt-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-mute">All 5 laps sealed</p>
          <p className="mt-2 font-poster text-4xl font-black tabular-nums">
            {runScore} <span className="text-xl text-mute">vs {toBeat}</span>
          </p>
          <p className={`mt-2 max-w-xl text-sm font-semibold ${runScore > toBeat ? 'text-lime' : 'text-mute'}`}>
            {runScore > toBeat
              ? 'Every lap is sealed and it beats the crown. Grab it.'
              : 'Every lap is sealed, but the crown still stands. Pay a new entry for a fresh run.'}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-poster text-xl font-black uppercase">
              Lap {current} <span className="text-base text-mute">of {LAPS}</span>
            </p>
            {windowLeft != null ? (
              <p className={`font-mono text-[11px] font-bold uppercase ${windowLeft < 30_000 ? 'text-danger' : 'text-white'}`}>
                {windowLeft > 0 ? `${formatWait(windowLeft)} left on this lap` : 'This lap’s time is up'}
              </p>
            ) : null}
          </div>
          <p className="mt-2 max-w-xl text-sm text-mute">
            {windowLeft === 0
              ? 'This lap’s window closed, so the run can’t go on. This entry comes back to you after the game.'
              : cleanScore == null && crashScore == null
                ? 'Race the lap above. Try it as many times as you like, then seal your best try.'
                : [
                    cleanScore != null ? `Best clean try: ${cleanScore}. Seal it to race on.` : null,
                    crashScore != null ? `Best crashed try: ${crashScore}. Sealing a crash ends your run.` : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
          </p>
          {windowLeft !== 0 && (cleanScore != null || crashScore != null) ? (
            <div className="mt-4 flex flex-wrap gap-3">
              {cleanScore != null ? (
                <Button size="lg" onClick={() => onSeal('clean')} disabled={busy}>
                  {`Seal lap ${current} · ${cleanScore}`}
                </Button>
              ) : null}
              {crashScore != null ? (
                <Button variant="danger" size="lg" onClick={() => onSeal('crash')} disabled={busy}>
                  {`Seal crash · ${crashScore} · ends run`}
                </Button>
              ) : null}
            </div>
          ) : null}
          <p className="mt-3 text-xs text-mute">
            A sealed lap is final, and the block it lands in becomes the seed of the next lap. Your browser signs it, so no wallet pops up.
          </p>
        </div>
      )}
    </div>
  );
}
