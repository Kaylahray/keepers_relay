'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { CrownRunDrive, type DrivenLap } from '@/components/game/CrownRunDrive';
import { RunPicks } from '@/components/game/RunPicks';
import { NextLap, RunLayer, RunSummary, type LapLine } from '@/components/game/RunScreens';
import { Button } from '@/components/ui/Button';
import { hexToBytes } from '@/lib/sudden-death/codec';
import type { DrivenLapRecord, SealedLapRecord } from '@/lib/crown/my-laps';
import { CROWN_RUN, picksDue, picksOf, runState, SAFE, unusedPicks, type LockedLap } from '@/lib/game/crown-run';

type Props = {
  driving: boolean;
  /** The locked laps, each on its own road. */
  laps: LockedLap[];
  /** The next lap's road, once the chain has revealed it. */
  seed: bigint | null;
  sealed: SealedLapRecord[];
  driven: DrivenLapRecord | null;
  runOver: boolean;
  /** A lap has landed late, so the run can't go on. */
  late: boolean;
  toBeat: number;
  holder: string | null;
  /** The clock ran out while this run was going. */
  timeUp: boolean;
  /** How long is left to lock the lap, or to take the crown, or null while waiting for the chain. */
  windowLeft: number | null;
  canTake: boolean;
  busy: string | null;
  error: string | null;
  waitedSeconds: number | null;
  formatWait: (ms: number) => string;
  onStartLap: () => void;
  onDriven: (lap: DrivenLap) => void;
  onPick: (upgrade: number | null, road: number) => void;
  /** Sends a driven lap whose picks are already made. */
  onLock: () => void;
  onTake: () => void;
  /** Locks a crashed lap that beats the crown, then takes the crown with it. */
  onLockAndTake: () => void;
  onLeave: () => void;
};

/** A crown run on the full screen, from one lap to the next: drive, pick, lock, wait for the road, take the crown or go on. */
export function CrownRunLayer({
  driving,
  laps,
  seed,
  sealed,
  driven,
  runOver,
  late,
  toBeat,
  holder,
  timeUp,
  windowLeft,
  canTake,
  busy,
  error,
  waitedSeconds,
  formatWait,
  onStartLap,
  onDriven,
  onPick,
  onLock,
  onTake,
  onLockAndTake,
  onLeave,
}: Props) {
  const tapes = useMemo(() => sealed.map((lap) => hexToBytes(lap.tape)), [sealed]);
  const { owned, road } = useMemo(() => runState(tapes), [tapes]);
  const score = driven?.score ?? sealed.at(-1)?.score ?? 0;
  const coins = driven?.coins ?? sealed.at(-1)?.coins ?? 0;
  const lapIndex = sealed.length;
  const beats = score > toBeat;

  const lines: LapLine[] = sealed.map((lap, i) => ({
    score: lap.score - (sealed[i - 1]?.score ?? 0),
    road: i === 0 ? SAFE : (picksOf(tapes[i - 1]!, i - 1).road ?? SAFE),
    upgrade: picksOf(tapes[i]!, i).upgrade,
  }));
  if (driven) lines.push({ score: driven.score - (sealed.at(-1)?.score ?? 0), road, upgrade: driven.picks?.upgrade ?? null });

  const windowNote =
    windowLeft == null ? null : windowLeft > 0 ? (
      <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${windowLeft <= 30_000 ? 'bg-danger/15 text-danger' : 'bg-gold/10 text-gold'}`}>
        {`${formatWait(windowLeft)} left. After that your run stops and a takeover won't count.`}
      </p>
    ) : (
      <p className="mt-3 rounded-lg bg-danger/15 px-3 py-2 text-xs font-semibold text-danger">This lap&apos;s time is up, so your run stops here.</p>
    );

  const standing = (
    <dl className="mt-3 space-y-2 rounded-xl bg-ink-2 p-3 text-sm">
      <div className="flex justify-between gap-3">
        <dt className="text-mute">Crown holder</dt>
        <dd className="truncate font-semibold">{holder ?? 'Nobody yet'}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-mute">Score to beat</dt>
        <dd className="font-mono font-bold tabular-nums">{toBeat}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-mute">You</dt>
        <dd className={`font-semibold ${beats ? 'text-lime' : 'text-mute'}`}>{beats ? 'You can take the crown' : `${toBeat + 1 - score} more to take it`}</dd>
      </div>
    </dl>
  );

  const leave = (
    <button type="button" onClick={onLeave} className="h-10 w-full text-sm font-semibold text-mute hover:text-white">
      Back to the crown
    </button>
  );
  const errorNote = error ? <p className="mt-3 rounded-lg bg-danger/15 px-3 py-2 text-xs font-semibold text-danger">{error}</p> : null;

  const takeButton = (label: string) => (
    <Button variant="gold" size="xl" block disabled={!canTake} onClick={onTake}>
      {label}
    </Button>
  );

  let screen;
  if (driving && seed != null) {
    screen = <CrownRunDrive key={lapIndex} laps={laps} seed={seed} toBeat={toBeat} onDone={onDriven} />;
  } else if (driven?.crashed) {
    // A crash only needs locking if it can take the crown.
    screen = (
      <RunSummary title={`Crashed on lap ${driven.lap + 1}`} score={score} crashedLap={driven.lap} coins={coins} owned={owned} lines={lines} note={<>{beats && !timeUp ? windowNote : null}{errorNote}</>}>
        {beats && !timeUp && (windowLeft == null || windowLeft > 0) ? (
          <Button variant="gold" size="xl" block disabled={Boolean(busy)} onClick={onLockAndTake}>
            {busy ?? `Lock in and take the crown with ${score}`}
          </Button>
        ) : (
          <p className="text-center text-sm text-mute">{beats ? 'Too late to take the crown.' : `${toBeat} still stands. Your entry comes back after the game.`}</p>
        )}
        {busy ? null : leave}
      </RunSummary>
    );
  } else if (driven && picksDue(driven.lap) > 0 && !driven.picks) {
    screen = <RunPicks lap={driven.lap} owned={owned} score={score} seconds={CROWN_RUN.PICK_SECONDS} onPick={onPick} />;
  } else if (driven) {
    // The lap and its picks are on their way to the chain.
    screen = (
      <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center px-4 text-center">
        <p className="font-mono text-[11px] uppercase tracking-wider text-lime">Lap {driven.lap + 1} done · {score}</p>
        {error ? (
          <>
            {errorNote}
            <Button variant="lime" size="xl" block className="mt-4" onClick={onLock} disabled={Boolean(busy)}>
              Try locking again
            </Button>
          </>
        ) : (
          <div className="mt-3 rounded-2xl bg-ink-2">
            <ChainLoader compact title={busy ?? `Locking lap ${driven.lap + 1}…`} />
          </div>
        )}
        {windowNote}
      </div>
    );
  } else if (runOver || late) {
    const finished = sealed.length >= CROWN_RUN.LAPS;
    screen = (
      <RunSummary
        title={finished ? 'Run finished' : sealed.at(-1)?.crashed ? `Crashed on lap ${sealed.length}` : late ? 'Lap locked too late' : 'Run over'}
        score={score}
        crashedLap={sealed.at(-1)?.crashed ? sealed.length - 1 : null}
        coins={coins}
        owned={owned}
        lines={lines}
        unused={unusedPicks(tapes)}
        note={<>{beats && canTake && !late ? windowNote : null}{errorNote}</>}
      >
        {beats && !timeUp && !late ? takeButton(busy ?? `Take the crown with ${score}`) : <p className="text-center text-sm text-mute">{beats ? 'Too late to take the crown.' : `${toBeat} still stands. Your entry comes back after the game.`}</p>}
        {busy ? null : leave}
      </RunSummary>
    );
  } else if (seed == null) {
    screen = (
      <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center px-4 text-center">
        <div className="rounded-2xl bg-ink-2">
          <ChainLoader
            compact
            title={sealed.length === 0 ? 'Confirming your entry…' : `Locking lap ${sealed.length}…${waitedSeconds != null ? ` ${waitedSeconds}s` : ''}`}
            note={sealed.length < CROWN_RUN.LAPS ? `Lap ${sealed.length + 1} starts when it lands.` : undefined}
          />
        </div>
        {leave}
      </div>
    );
  } else {
    const roomToDrive = windowLeft == null || windowLeft >= CROWN_RUN.LAP_NEEDS_MS;
    screen = (
      <NextLap lap={lapIndex} score={score} owned={owned} road={road} aside={<>{lapIndex > 0 ? standing : null}{windowNote}{errorNote}</>}>
        {timeUp ? (
          <p className="text-center text-sm text-mute">Time&apos;s up. The clock ran out during your run.</p>
        ) : (
          <>
            {beats ? takeButton(busy ?? `Take the crown with ${score}`) : null}
            {roomToDrive ? (
              <Button variant={beats ? 'outline' : 'lime'} size="xl" block onClick={onStartLap} disabled={Boolean(busy)}>
                {beats ? `Go on: lap ${lapIndex + 1}` : `Start lap ${lapIndex + 1}`}
              </Button>
            ) : (
              <p className="text-center text-sm text-mute">Not enough time left to drive this lap.</p>
            )}
            {beats ? <p className="text-center text-xs text-mute">Taking the crown ends your run with this score.</p> : null}
          </>
        )}
        {busy ? null : leave}
      </NextLap>
    );
  }

  return (
    <RunLayer>
      {driving ? null : (
        <button type="button" onClick={onLeave} aria-label="Back to the crown" className="absolute right-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-xl bg-ink-3 text-white" style={{ marginTop: 'env(safe-area-inset-top)' }}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      {screen}
    </RunLayer>
  );
}
