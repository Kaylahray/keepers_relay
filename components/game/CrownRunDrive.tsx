'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LapBoxes, type LapState } from '@/components/ui/kit';
import { UpgradeBadges } from '@/components/game/RunPicks';
import { CROWN_RUN, DANGER, MoveRecorder, loadCrownRun, restore, type CrownRun, type LockedLap, type RunRow } from '@/lib/game/crown-run';
import { createNightDrive, type NightDrive } from '@/lib/game/night-drive';

export type DrivenLap = { moves: Uint8Array; score: number; coins: number; crashed: boolean; owned: number };

type Props = {
  /** The laps locked so far. */
  laps: LockedLap[];
  /** This lap's road. */
  seed: bigint;
  /** The score to beat, or 0 when there is none. */
  toBeat?: number;
  onDone: (lap: DrivenLap) => void;
  tone?: 'lime' | 'pink';
};

const TICK_MS = 1000 / CROWN_RUN.TICK_HZ;
const COUNTDOWN_MS = 2_400;
const HOLD_MS = 1_100;
/** Where the car sits on the flat road, as a share of its height: the line the rules check for hits. */
const CAR_TOP = 76;

/** Drives one lap on the wasm rules the chain replays. It fills its parent. */
export function CrownRunDrive({ laps, seed, toBeat = 0, onDone, tone = 'lime' }: Props) {
  const lapIndex = laps.length;
  const endTick = (lapIndex + 1) * CROWN_RUN.LAP_TICKS;
  const [phase, setPhase] = useState<'loading' | 'counting' | 'playing' | 'over'>('loading');
  const [loadError, setLoadError] = useState(false);
  const [hud, setHud] = useState({ score: 0, seconds: 30, owned: 0, road: 0, shield: false, streak: 0 });
  const [count, setCount] = useState(3);
  const [crashed, setCrashed] = useState(false);
  const [shieldHit, setShieldHit] = useState(false);
  const [noGl, setNoGl] = useState(false);
  const [frame, setFrame] = useState<{ rows: RunRow[]; x: number }>({ rows: [], x: CROWN_RUN.LANE_W });
  const runnerRef = useRef<CrownRun | null>(null);
  const glRef = useRef<HTMLCanvasElement | null>(null);
  const driveRef = useRef<NightDrive | null>(null);
  const noGlRef = useRef(false);
  const wantedRef = useRef(1);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const draw = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    const canvas = glRef.current;
    if (canvas && !noGlRef.current) {
      const danger = runner.road() === DANGER;
      driveRef.current ??= createNightDrive(canvas, {
        paint: tone === 'lime' ? 0x99ee2d : 0xff56f6,
        theme: danger ? { edge: 0xff5a5a, lane: 0xff8a1f } : undefined,
      });
      if (driveRef.current) {
        driveRef.current.render({ x: runner.x(), rows: runner.rows(), tick: runner.tick(), crashed: runner.crashed(), speed: runner.speed() }, performance.now());
        return;
      }
      noGlRef.current = true;
      setNoGl(true);
    }
    setFrame({ rows: runner.rows(), x: runner.x() });
  }, [tone]);

  useEffect(
    () => () => {
      driveRef.current?.dispose();
      driveRef.current = null;
    },
    [],
  );

  // Loads the run, counts down, then drives the lap on fixed ticks, however fast the screen refreshes.
  useEffect(() => {
    let stop = false;
    let raf = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const read = (runner: CrownRun) => ({
      score: runner.score(),
      seconds: Math.ceil((endTick - runner.tick()) / CROWN_RUN.TICK_HZ),
      owned: runner.owned(),
      road: runner.road(),
      shield: runner.shieldReady(),
      streak: runner.streak(),
    });
    const drive = (runner: CrownRun) => {
      const recorder = new MoveRecorder();
      let target = runner.target();
      wantedRef.current = target;
      let carry = 0;
      let at = performance.now();
      let hadShield = runner.shieldReady();
      const loop = (now: number) => {
        if (stop) return;
        carry += now - at;
        at = now;
        // A slow frame catches up, a fast one waits.
        let steps = 0;
        while (carry >= TICK_MS && !runner.over() && runner.tick() < endTick && steps < 8) {
          carry -= TICK_MS;
          steps += 1;
          if (recorder.record(runner.tick(), wantedRef.current, target)) {
            target = wantedRef.current;
            runner.step(target);
          } else {
            runner.step(null);
          }
        }
        if (hadShield && !runner.shieldReady()) {
          hadShield = false;
          setShieldHit(true);
          timers.push(setTimeout(() => setShieldHit(false), 1_200));
        }
        draw();
        setHud(read(runner));
        if (runner.crashed() || runner.tick() >= endTick) {
          const lap = { moves: recorder.moves(), score: runner.score(), coins: runner.coins(), crashed: runner.crashed(), owned: runner.owned() };
          setCrashed(lap.crashed);
          setPhase('over');
          timers.push(setTimeout(() => doneRef.current(lap), HOLD_MS));
          return;
        }
        raf = requestAnimationFrame(loop);
      };
      setPhase('playing');
      raf = requestAnimationFrame(loop);
    };
    loadCrownRun()
      .then((runner) => {
        if (stop) return;
        runnerRef.current = runner;
        restore(runner, laps, seed);
        setHud(read(runner));
        setPhase('counting');
        draw();
        [2, 1].forEach((value, i) => timers.push(setTimeout(() => setCount(value), ((i + 1) * COUNTDOWN_MS) / 3)));
        timers.push(setTimeout(() => !stop && drive(runner), COUNTDOWN_MS));
      })
      .catch(() => {
        if (!stop) setLoadError(true);
      });
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
    // A lap is driven once; the parent remounts this component for the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const steer = useCallback((delta: number) => {
    wantedRef.current = Math.min(CROWN_RUN.LANES - 1, Math.max(0, wantedRef.current + delta));
  }, []);

  useEffect(() => {
    const keys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, a: -1, d: 1 };
    const onKey = (event: KeyboardEvent) => {
      const delta = keys[event.key];
      if (delta == null) return;
      event.preventDefault();
      steer(delta);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steer]);

  const lapStates: LapState[] = Array.from({ length: CROWN_RUN.LAPS }, (_, i) =>
    i < lapIndex ? 'done' : i === lapIndex ? (crashed ? 'crash' : 'current') : 'empty',
  );
  const danger = hud.road === DANGER;
  const carLeft = (frame.x / CROWN_RUN.LANE_W) * 33.333 + 16.666;

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[480px] flex-col">
      <div className="relative z-20 space-y-2 px-3 pb-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="flex items-end justify-between">
          <div className="w-24">
            <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Lap {lapIndex + 1}</p>
            <p className={`font-mono text-lg font-bold tabular-nums ${hud.seconds < 4 && phase === 'playing' ? 'text-danger' : ''}`}>{hud.seconds}s</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Score</p>
            <p className={`font-poster text-3xl font-black tabular-nums leading-none ${toBeat > 0 && hud.score > toBeat ? 'text-gold' : ''}`}>{hud.score}</p>
          </div>
          <div className="w-24 text-right">
            <p className={`font-mono text-[10px] font-bold uppercase tracking-wider ${danger ? 'text-danger' : 'text-lime'}`}>{danger ? 'Danger road' : 'Safe road'}</p>
            {toBeat > 0 ? <p className="font-mono text-xs text-mute">beat <span className="font-bold text-white">{toBeat}</span></p> : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <LapBoxes states={lapStates} tone={tone} size="sm" label="Your laps" />
          <UpgradeBadges owned={hud.owned} shieldReady={hud.shield} streak={hud.streak} />
        </div>
      </div>

      <div
        role="application"
        aria-label="Crown Run. Left and right arrows change lane."
        onPointerDown={(event) => {
          if (phase !== 'playing') return;
          const box = event.currentTarget.getBoundingClientRect();
          steer(event.clientX - box.left < box.width / 2 ? -1 : 1);
        }}
        className={`relative flex-1 touch-none select-none overflow-hidden bg-[#1b1b1b] ${crashed ? 'runner-crash' : ''}`}
      >
        {noGl ? null : <canvas ref={glRef} className="absolute inset-0 block h-full w-full" aria-hidden="true" />}
        {noGl ? <FlatRoad rows={frame.rows} carLeft={carLeft} crashed={crashed} moving={phase === 'playing'} /> : null}

        {shieldHit ? (
          <p className="absolute inset-x-0 top-6 z-10 text-center font-poster text-2xl font-black uppercase text-chain drop-shadow">Shield used</p>
        ) : null}

        {phase !== 'playing' ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ink/40 px-6 text-center">
            {loadError ? (
              <div>
                <p className="text-sm text-danger">The game could not load.</p>
                <Button variant="ghost" className="mt-4" onClick={() => window.location.reload()}>
                  Refresh
                </Button>
              </div>
            ) : phase === 'loading' ? (
              <p className="font-mono text-xs uppercase text-mute">Loading the road…</p>
            ) : phase === 'counting' ? (
              <p className="font-poster text-7xl font-black tabular-nums">{count}</p>
            ) : (
              <p className={`font-poster text-4xl font-black uppercase ${crashed ? 'text-danger' : 'text-lime'}`}>{crashed ? 'Crashed' : `Lap ${lapIndex + 1} clear`}</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 p-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <Button variant="ghost" size="xl" aria-label="Move left" onClick={() => steer(-1)} disabled={phase !== 'playing'}>
          <ChevronLeft className="h-7 w-7" />
        </Button>
        <Button variant="ghost" size="xl" aria-label="Move right" onClick={() => steer(1)} disabled={phase !== 'playing'}>
          <ChevronRight className="h-7 w-7" />
        </Button>
      </div>
    </div>
  );
}

/** The road for phones without WebGL. */
function FlatRoad({ rows, carLeft, crashed, moving }: { rows: RunRow[]; carLeft: number; crashed: boolean; moving: boolean }) {
  const place = (lane: number) => `${lane * 33.333 + 16.666}%`;
  return (
    <>
      <div className="absolute inset-y-0 left-0 w-1.5 bg-lime/60" />
      <div className="absolute inset-y-0 right-0 w-1.5 bg-lime/60" />
      <div className={`road-lines absolute inset-y-0 left-1/3 w-1 -translate-x-1/2 ${moving ? 'moving' : ''}`} />
      <div className={`road-lines absolute inset-y-0 left-2/3 w-1 -translate-x-1/2 ${moving ? 'moving' : ''}`} />
      {rows.map((row, r) => {
        const top = `${CAR_TOP - (row.y / CROWN_RUN.VIEW_DEPTH) * (CAR_TOP + 12)}%`;
        return (
          <div key={`${r}-${row.y}`}>
            {[0, 1, 2].map((lane) =>
              row.blocked & (1 << lane) ? (
                <div key={lane} className="absolute h-[7%] w-[26%] -translate-x-1/2 -translate-y-full rounded bg-fire" style={{ top, left: place(lane) }} />
              ) : null,
            )}
            {row.shift >= 0 ? (
              <div className="absolute h-[7%] w-[26%] -translate-x-1/2 -translate-y-full rounded border-2 border-dashed border-danger" style={{ top, left: place(row.shift) }} />
            ) : null}
            {row.coin >= 0 ? <div className="absolute h-5 w-5 -translate-x-1/2 -translate-y-full rounded-full bg-gold" style={{ top, left: place(row.coin) }} /> : null}
          </div>
        );
      })}
      <div className={`absolute h-[12%] w-[15%] -translate-x-1/2 rounded-lg transition-[left] duration-100 ${crashed ? 'bg-danger' : 'bg-lime'}`} style={{ top: `${CAR_TOP}%`, left: `${carLeft}%` }} />
    </>
  );
}
