'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { ChainLoader } from '@/components/arena/ChainLoader';
import type { CrownLayerProps } from '@/components/crown/CrownRunLayer';
import { DepthsFloor } from '@/components/game/DepthsFloor';
import { DepthsNext, DepthsPicks, DepthsSummary, type FloorLine } from '@/components/game/DepthsScreens';
import { RunLayer } from '@/components/game/RunScreens';
import { Button } from '@/components/ui/Button';
import { hexToBytes } from '@/lib/sudden-death/codec';
import { DEPTHS, SAFE, picksDue, picksOf, runState, unusedPicks } from '@/lib/game/depths';

/** A Crown Depths run on the full screen, from one floor to the next: explore, pick, lock, wait for the next map, take the crown or go on. */
export function DepthsLayer({
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
}: CrownLayerProps) {
  const tapes = useMemo(() => sealed.map((floor) => hexToBytes(floor.tape)), [sealed]);
  const { owned, stairs } = useMemo(() => runState(tapes), [tapes]);
  const score = driven?.score ?? sealed.at(-1)?.score ?? 0;
  const gold = driven?.coins ?? sealed.at(-1)?.coins ?? 0;
  const floorIndex = sealed.length;
  const beats = score > toBeat;

  const lines: FloorLine[] = sealed.map((floor, i) => ({
    score: floor.score - (sealed[i - 1]?.score ?? 0),
    stairs: i === 0 ? SAFE : (picksOf(tapes[i - 1]!).stairs ?? SAFE),
    relic: picksOf(tapes[i]!).relic,
  }));
  if (driven) lines.push({ score: driven.score - (sealed.at(-1)?.score ?? 0), stairs, relic: driven.picks?.upgrade ?? null });

  const windowNote =
    windowLeft == null ? null : windowLeft > 0 ? (
      <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${windowLeft <= 30_000 ? 'bg-danger/15 text-danger' : 'bg-gold/10 text-gold'}`}>
        {`${formatWait(windowLeft)} left. After that your run stops and a takeover won't count.`}
      </p>
    ) : (
      <p className="mt-3 rounded-lg bg-danger/15 px-3 py-2 text-xs font-semibold text-danger">This floor&apos;s time is up, so your run stops here.</p>
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
  const stands = <p className="text-center text-sm text-mute">{beats ? 'Too late to take the crown.' : `${toBeat} still stands. Your entry comes back after the game.`}</p>;

  let screen;
  if (driving && seed != null) {
    screen = <DepthsFloor key={floorIndex} floors={laps} seed={seed} toBeat={toBeat} onDone={onDriven} />;
  } else if (driven?.crashed) {
    // A floor that ended in the dark only needs locking if it can take the crown.
    screen = (
      <DepthsSummary title={`Run ended on floor ${driven.lap + 1}`} score={score} endedFloor={driven.lap} gold={gold} owned={owned} lines={lines} note={<>{beats && !timeUp ? windowNote : null}{errorNote}</>}>
        {beats && !timeUp && (windowLeft == null || windowLeft > 0) ? (
          <Button variant="gold" size="xl" block disabled={Boolean(busy)} onClick={onLockAndTake}>
            {busy ?? `Lock in and take the crown with ${score}`}
          </Button>
        ) : (
          stands
        )}
        {busy ? null : leave}
      </DepthsSummary>
    );
  } else if (driven && picksDue(driven.lap) > 0 && !driven.picks) {
    screen = <DepthsPicks floor={driven.lap} owned={owned} score={score} seconds={DEPTHS.PICK_SECONDS} onPick={(relic, next) => onPick(relic, next)} />;
  } else if (driven) {
    // The floor and its picks are on their way to the chain.
    screen = (
      <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center px-4 text-center">
        <p className="font-mono text-[11px] uppercase tracking-wider text-lime">Floor {driven.lap + 1} done · {score}</p>
        {error ? (
          <>
            {errorNote}
            <Button variant="lime" size="xl" block className="mt-4" onClick={onLock} disabled={Boolean(busy)}>
              Try locking again
            </Button>
          </>
        ) : (
          <div className="mt-3 rounded-2xl bg-ink-2">
            <ChainLoader
              compact
              title={busy ?? `Locking floor ${driven.lap + 1}…`}
              note={driven.lap + 1 < DEPTHS.FLOORS ? `Floor ${driven.lap + 2}'s map comes from the block it lands in.` : undefined}
            />
          </div>
        )}
        {/* The old floor's countdown only matters here if the lock has to be sent again. */}
        {error ? windowNote : null}
        {leave}
      </div>
    );
  } else if (runOver || late) {
    const finished = sealed.length >= DEPTHS.FLOORS;
    const ended = sealed.at(-1)?.crashed ?? false;
    screen = (
      <DepthsSummary
        title={finished ? 'Run finished' : ended ? `Run ended on floor ${sealed.length}` : late ? 'Floor locked too late' : 'Run over'}
        score={score}
        endedFloor={ended ? sealed.length - 1 : null}
        gold={gold}
        owned={owned}
        lines={lines}
        unused={unusedPicks(tapes)}
        note={<>{beats && canTake && !late ? windowNote : null}{errorNote}</>}
      >
        {beats && !timeUp && !late ? (
          <Button variant="gold" size="xl" block disabled={!canTake} onClick={onTake}>
            {busy ?? `Take the crown with ${score}`}
          </Button>
        ) : (
          stands
        )}
        {busy ? null : leave}
      </DepthsSummary>
    );
  } else if (seed == null) {
    screen = (
      <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center px-4 text-center">
        <div className="rounded-2xl bg-ink-2">
          <ChainLoader
            compact
            title={sealed.length === 0 ? 'Confirming your entry…' : `Locking floor ${sealed.length}…${waitedSeconds != null ? ` ${waitedSeconds}s` : ''}`}
            note={sealed.length < DEPTHS.FLOORS ? `Floor ${sealed.length + 1}'s map comes from the block it lands in.` : undefined}
          />
        </div>
        {leave}
      </div>
    );
  } else {
    const roomToPlay = windowLeft == null || windowLeft >= DEPTHS.LAP_NEEDS_MS;
    screen = (
      <DepthsNext floor={floorIndex} score={score} owned={owned} stairs={stairs} aside={<>{floorIndex > 0 ? standing : null}{windowNote}{errorNote}</>}>
        {timeUp ? (
          <p className="text-center text-sm text-mute">Time&apos;s up. The clock ran out during your run.</p>
        ) : (
          <>
            {beats ? (
              <Button variant="gold" size="xl" block disabled={!canTake} onClick={onTake}>
                {busy ?? `Take the crown with ${score}`}
              </Button>
            ) : null}
            {roomToPlay ? (
              <Button variant={beats ? 'outline' : 'lime'} size="xl" block onClick={onStartLap} disabled={Boolean(busy)}>
                {beats ? `Go on: floor ${floorIndex + 1}` : `Enter floor ${floorIndex + 1}`}
              </Button>
            ) : (
              <p className="text-center text-sm text-mute">Not enough time left to explore this floor.</p>
            )}
            {beats ? <p className="text-center text-xs text-mute">Taking the crown ends your run with this score.</p> : null}
          </>
        )}
        {busy ? null : leave}
      </DepthsNext>
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
