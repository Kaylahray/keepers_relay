'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { UpgradeBadges } from '@/components/game/RunPicks';
import { Button } from '@/components/ui/Button';
import { CROWN_RUN, DANGER, loadCrownRun, picksDue, picksOf, type CrownRun, type LockedLap } from '@/lib/game/crown-run';
import { createNightDrive, type NightDrive } from '@/lib/game/night-drive';

const TICK_MS = 1000 / CROWN_RUN.TICK_HZ;

/** A recorded run: each lap's road seed, then its moves and picks, as the chain stores them. */
export type RecordedRun = { laps: LockedLap[] };

/** Plays a recorded run back on the real game, like a video: the same roads, moves and picks, scored by the same rules the chain replayed. */
export function RunPlayback({ run, title }: { run: RecordedRun; title?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<CrownRun | null>(null);
  const driveRef = useRef<NightDrive | null>(null);
  const frame = useRef(0);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'playing' | 'done'>('loading');
  const [hud, setHud] = useState({ score: 0, lap: 1, owned: 0, road: 0 });
  const endTick = run.laps.length * CROWN_RUN.LAP_TICKS;

  useEffect(() => {
    let stop = false;
    void loadCrownRun().then((runner) => {
      if (stop) return;
      runnerRef.current = runner;
      setPhase('ready');
    });
    return () => {
      stop = true;
      cancelAnimationFrame(frame.current);
      driveRef.current?.dispose();
      driveRef.current = null;
    };
  }, []);

  const draw = useCallback(() => {
    const runner = runnerRef.current;
    const canvas = canvasRef.current;
    if (!runner || !canvas) return;
    if (!driveRef.current) driveRef.current = createNightDrive(canvas);
    driveRef.current?.render({ x: runner.x(), rows: runner.rows(), tick: runner.tick(), crashed: runner.crashed(), speed: runner.speed() }, performance.now());
  }, []);

  const play = useCallback(() => {
    const runner = runnerRef.current;
    const first = run.laps[0];
    if (!runner || !first) return;
    cancelAnimationFrame(frame.current);
    runner.start(first.seed);
    let lap = 0;
    let cursor = 0;
    let carry = 0;
    let at = performance.now();
    setPhase('playing');
    const loop = (now: number) => {
      carry += now - at;
      at = now;
      while (carry >= TICK_MS && !runner.over() && runner.tick() < endTick) {
        carry -= TICK_MS;
        const bytes = run.laps[lap]!.bytes;
        const offset = cursor * CROWN_RUN.EVENT_LEN;
        let input: number | null = null;
        if (offset + CROWN_RUN.EVENT_LEN <= bytes.length && (bytes[offset]! | (bytes[offset + 1]! << 8)) === runner.tick()) {
          input = bytes[offset + 2]!;
          cursor += 1;
        }
        runner.step(input);
        // A lap's picks apply as it ends, then the next lap drives its own road.
        if (runner.tick() === (lap + 1) * CROWN_RUN.LAP_TICKS && !runner.crashed() && run.laps[lap + 1]) {
          const picks = picksOf(bytes, lap);
          if (picksDue(lap) > 0 && picks.road != null) runner.choose(picks.upgrade, picks.road);
          lap += 1;
          cursor = 0;
          runner.reseed(run.laps[lap]!.seed);
        }
      }
      draw();
      setHud({ score: runner.score(), lap: lap + 1, owned: runner.owned(), road: runner.road() });
      if (runner.over() || runner.tick() >= endTick) {
        setPhase('done');
        return;
      }
      frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
  }, [run, endTick, draw]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink-2">
      <canvas ref={canvasRef} className="block h-[min(56vh,460px)] w-full" aria-label={title ?? 'Recorded run'} />
      {phase === 'playing' || phase === 'done' ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-ink/70 to-transparent p-3 pb-8 font-mono text-[11px] uppercase text-white/80">
          <div>
            <p>Lap {Math.min(hud.lap, run.laps.length)} of {run.laps.length}</p>
            <p className={hud.road === DANGER ? 'text-danger' : 'text-lime'}>{hud.road === DANGER ? 'Danger road' : 'Safe road'}</p>
          </div>
          <span className="font-poster text-3xl font-black leading-none tabular-nums text-white">{hud.score}</span>
          <UpgradeBadges owned={hud.owned} />
        </div>
      ) : null}
      {phase !== 'playing' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/60 px-6 text-center">
          {phase === 'loading' ? (
            <ChainLoader inline title="Loading the run…" />
          ) : (
            <>
              {phase === 'done' ? <p className="font-poster text-5xl font-black tabular-nums">{hud.score}</p> : null}
              {phase === 'done' ? <p className="font-mono text-xs text-white/80">All laps replayed ✓</p> : null}
              {title && phase === 'ready' ? <p className="rounded-xl bg-ink/80 px-4 py-2 font-semibold">{title}</p> : null}
              <Button variant="ghost" onClick={play}>
                {phase === 'done' ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                {phase === 'done' ? 'Watch again' : 'Watch the run'}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
