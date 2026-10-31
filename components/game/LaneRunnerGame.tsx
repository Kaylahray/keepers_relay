'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { LANE, loadLaneRunner, TapeRecorder, type LaneRow, type LaneRunner } from '@/lib/game/lane-runner';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { LapBoxes, type LapState } from '@/components/ui/kit';

export type FinishedRun = { tape: Uint8Array; score: number; seed: bigint; crashed: boolean };

/** The run so far in lap mode: each lap's seed and its sealed moves. */
export type LapPlan = { seeds: bigint[]; sealed: Uint8Array[] };

type Props = {
  /** The course. On chain it is the player's own seed for this match. */
  seed: bigint;
  /** The standing score, shown as the line to beat. */
  toBeat: number;
  onFinish: (run: FinishedRun) => void;
  /** Shown on the start screen. */
  startLabel?: string;
  /** Plays only the next lap of a run, starting where its sealed laps left off. */
  lap?: LapPlan;
  /** Time left to seal this lap on chain (its 3-minute window), or null when there is none. Retries use it up. */
  sealLeftMs?: number | null;
  /** The mode's colour: lime for a crown, pink for a duel. */
  tone?: 'lime' | 'pink';
  /** Shown beside the road on wide screens. */
  title?: string;
};

/** Puts the runner where the next lap starts: replays the sealed laps, each on its own seed, then seeds the lap about to be played. */
function prepare(runner: LaneRunner, seed: bigint, lap?: LapPlan) {
  if (!lap) {
    runner.start(seed);
    return;
  }
  runner.start(lap.seeds[0] ?? seed);
  const end = lap.sealed.length * LANE.LAP_TICKS;
  let current = 0;
  let cursor = 0;
  while (!runner.over() && runner.tick() < end) {
    const index = Math.floor(runner.tick() / LANE.LAP_TICKS);
    if (index !== current) {
      current = index;
      cursor = 0;
      runner.reseed(lap.seeds[index] ?? seed);
    }
    const tape = lap.sealed[index] ?? new Uint8Array();
    let input: number | null = null;
    const at = cursor * LANE.EVENT_LEN;
    if (at < tape.length && (tape[at]! | (tape[at + 1]! << 8)) === runner.tick()) {
      input = tape[at + 2]!;
      cursor += 1;
    }
    runner.step(input);
  }
  if (lap.sealed.length > 0 && !runner.over()) runner.reseed(seed);
}

const TICK_MS = 1000 / LANE.TICK_HZ;
/** Plays the lane runner on the same wasm rules the chain replays. */
export function LaneRunnerGame({ seed, toBeat, onFinish, startLabel = 'Run', lap, tone = 'lime', title = 'Lane runner', sealLeftMs = null }: Props) {
  // A lap plays to the end of its own ticks; a whole run to the end of the run.
  const endTick = lap ? (lap.sealed.length + 1) * LANE.LAP_TICKS : LANE.MAX_TICKS;
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // On a phone the run takes the whole screen, like any mobile game. Desktop keeps it in the page.
  const [immersive, setImmersive] = useState(false);
  const runnerRef = useRef<LaneRunner | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'playing' | 'over'>('loading');
  const [hud, setHud] = useState({ score: 0, seconds: LANE.MAX_TICKS / LANE.TICK_HZ });
  const lapRef = useRef(lap);
  useEffect(() => {
    lapRef.current = lap;
  }, [lap]);
  const [last, setLast] = useState<number | null>(null);
  const play = useRef<{ target: number; wanted: number; recorder: TapeRecorder; frame: number; carry: number; at: number } | null>(
    null,
  );
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    let stop = false;
    loadLaneRunner()
      .then((runner) => {
        if (stop) return;
        runnerRef.current = runner;
        prepare(runner, seed, lapRef.current);
        setPhase('ready');
      })
      .catch(() => {
        if (!stop) setLoadError('The game could not load. Refresh to try again.');
      });
    return () => {
      stop = true;
    };
  }, [seed]);

  // What the road shows right now, read from the rules after every tick.
  const [frame, setFrame] = useState<{ rows: LaneRow[]; x: number; crashed: boolean }>({ rows: [], x: LANE.LANE_W, crashed: false });

  const draw = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    setFrame({ rows: runner.rows(), x: runner.x(), crashed: runner.over() && runner.tick() < LANE.MAX_TICKS });
  }, []);

  useEffect(() => {
    if (phase === 'ready' || phase === 'over') draw();
  }, [phase, draw]);

  const steer = useCallback((delta: number | null, lane?: number) => {
    const state = play.current;
    if (!state) return;
    const base = state.wanted;
    const next = lane ?? Math.min(LANE.LANES - 1, Math.max(0, base + (delta ?? 0)));
    state.wanted = next;
  }, []);

  const start = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    // A run fills the screen on every device, like a game app.
    setImmersive(true);
    if (window.matchMedia('(max-width: 767px)').matches) {
      // Hides the browser bars where the phone allows it (Android).
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
    prepare(runner, seed, lap);
    // A later lap starts mid-run, heading for whatever lane the last lap ended in.
    const lane = runner.target();
    play.current = { target: lane, wanted: lane, recorder: new TapeRecorder(), frame: 0, carry: 0, at: performance.now() };
    setPhase('playing');
    setLast(null);

    const loop = (now: number) => {
      const state = play.current;
      if (!state) return;
      state.carry += now - state.at;
      state.at = now;
      // Fixed ticks, however fast the screen refreshes. A slow frame catches up, a fast one waits.
      let steps = 0;
      while (state.carry >= TICK_MS && !runner.over() && runner.tick() < endTick && steps < 8) {
        state.carry -= TICK_MS;
        steps += 1;
        const tick = runner.tick();
        if (state.recorder.record(tick, state.wanted, state.target)) {
          state.target = state.wanted;
          runner.step(state.target);
        } else {
          runner.step(null);
        }
      }
      draw();
      setHud({ score: runner.score(), seconds: Math.ceil((endTick - runner.tick()) / LANE.TICK_HZ) });
      if (runner.over() || runner.tick() >= endTick) {
        const run = { tape: state.recorder.tape(), score: runner.score(), seed, crashed: runner.over() && runner.tick() < LANE.MAX_TICKS };
        play.current = null;
        setLast(run.score);
        setPhase('over');
        finishRef.current(run);
        return;
      }
      state.frame = requestAnimationFrame(loop);
    };
    play.current.frame = requestAnimationFrame(loop);
  }, [draw, seed, lap, endTick]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase !== 'playing') {
        if ((event.key === ' ' || event.key === 'Enter') && phase !== 'loading' && document.activeElement === canvasRef.current) {
          event.preventDefault();
          start();
        }
        return;
      }
      const keys: Record<string, [number | null, number?]> = {
        ArrowLeft: [-1],
        ArrowRight: [1],
        a: [-1],
        d: [1],
        '1': [null, 0],
        '2': [null, 1],
        '3': [null, 2],
      };
      const hit = keys[event.key];
      if (!hit) return;
      event.preventDefault();
      steer(hit[0], hit[1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, start, steer]);

  useEffect(
    () => () => {
      if (play.current) cancelAnimationFrame(play.current.frame);
    },
    [],
  );

  const leave = useCallback(() => {
    setImmersive(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!immersive) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Leaving system full screen (back gesture) leaves the game layer too.
    const onChange = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, [immersive]);

  // The canvas changes size when the layer opens or closes; draw the still frame again at the new size.
  useEffect(() => {
    if (phase !== 'playing') requestAnimationFrame(() => draw());
  }, [immersive, phase, draw]);

  const beats = last != null && last > toBeat;
  const sealed = lap?.sealed.length ?? 0;
  const lapNo = lap ? sealed + 1 : null;
  const lapStates: LapState[] = Array.from({ length: LANE.LAPS }, (_, i) =>
    i < sealed ? 'done' : i === sealed ? (phase === 'over' && frame.crashed ? 'crash' : 'current') : 'empty',
  );
  const shown = phase === 'playing' || phase === 'over' ? hud.score : 0;
  const carLeft = (frame.x / LANE.LANE_W) * 33.333 + 16.666;
  const accent = tone === 'lime' ? 'text-lime' : 'text-pink';
  // The lap's real deadline: its 3-minute window on chain, not the 24 seconds of driving. Every retry spends it.
  const sealFace =
    sealLeftMs == null
      ? null
      : sealLeftMs <= 0
        ? 'closed'
        : `${Math.floor(sealLeftMs / 60_000)}:${String(Math.floor((sealLeftMs % 60_000) / 1000)).padStart(2, '0')}`;
  const sealUrgent = sealLeftMs != null && sealLeftMs < 45_000;
  const sealNote =
    sealFace == null ? null : sealFace === 'closed' ? (
      <p className="mt-3 rounded-lg bg-danger/15 px-3 py-2 text-xs font-semibold text-danger">This lap&apos;s seal window has closed.</p>
    ) : (
      <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${sealUrgent ? 'bg-danger/15 text-danger' : 'bg-gold/10 text-gold'}`}>
        {sealFace} left to seal this lap. Every try uses that time.
      </p>
    );

  const road = (
    <div
      ref={canvasRef}
      tabIndex={0}
      aria-label="Lane runner. Left and right arrows change lane."
      onPointerDown={(event) => {
        if (phase !== 'playing') return;
        const box = event.currentTarget.getBoundingClientRect();
        steer(event.clientX - box.left < box.width / 2 ? -1 : 1);
      }}
      className={`relative flex-1 touch-none select-none overflow-hidden bg-[#1b1b1b] outline-none ${phase === 'over' && frame.crashed ? 'runner-crash' : ''}`}
    >
      {/* Verges and lane lines */}
      <div className="absolute inset-y-0 left-0 w-1.5 bg-lime/60" />
      <div className="absolute inset-y-0 right-0 w-1.5 bg-lime/60" />
      <div className={`road-lines absolute inset-y-0 left-1/3 w-1 -translate-x-1/2 ${phase === 'playing' ? 'moving' : ''}`} />
      <div className={`road-lines absolute inset-y-0 left-2/3 w-1 -translate-x-1/2 ${phase === 'playing' ? 'moving' : ''}`} />

      {/* Road blocks and coins, where the rules have them */}
      {frame.rows.map((row, r) => {
        const top = CAR_TOP - (row.y / LANE.VIEW_DEPTH) * (CAR_TOP + 12);
        return (
          <div key={`${r}-${row.y}`}>
            {[0, 1, 2].map((lane) =>
              row.blocked & (1 << lane) ? (
                <div key={lane} className="absolute" style={{ top: `${top}%`, left: `${lane * 33.333 + 16.666}%`, height: '9%', width: '26%', transform: 'translate(-50%, -100%)' }}>
                  <div className="flex h-full items-center justify-center">
                    <Barrier />
                  </div>
                </div>
              ) : null,
            )}
            {row.coin >= 0 ? (
              <div className="absolute" style={{ top: `${top}%`, left: `${row.coin * 33.333 + 16.666}%`, height: '7%', width: '12%', transform: 'translate(-50%, -100%)' }}>
                <div className="flex h-full items-center justify-center">
                  <Coin />
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Your car */}
      <div className="absolute transition-[left] duration-100 ease-snap" style={{ top: `${CAR_TOP}%`, height: '12%', width: '15%', left: `${carLeft}%`, transform: 'translateX(-50%)' }}>
        <Car tone={tone} crashed={phase === 'over' && frame.crashed} />
      </div>

      {phase !== 'playing' ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-ink/70 px-6 backdrop-blur-[2px]">
          <div className="clip-panel w-full max-w-xs bg-ink-2 p-6 text-center">
            {loadError ? (
              <p className="text-sm text-danger">{loadError}</p>
            ) : phase === 'loading' ? (
              <p className="font-mono text-xs uppercase text-mute">Loading the game…</p>
            ) : phase === 'over' && last != null ? (
              <>
                <p className={`font-mono text-[11px] uppercase tracking-wider ${frame.crashed ? 'text-danger' : 'text-mute'}`}>
                  {frame.crashed ? (lapNo ? `Crash on lap ${lapNo}` : 'Crash') : lapNo ? `Lap ${lapNo} clear` : 'Run over'}
                </p>
                <p className={`mt-2 font-poster text-4xl font-black tabular-nums ${beats ? 'text-lime' : 'text-white'}`}>{last}</p>
                <p className="mt-2 text-sm text-mute">
                  {lap ? 'Seal it, or try this lap again.' : beats ? `That beats ${toBeat}.` : `${toBeat} still stands. Same course, run it again.`}
                </p>
                {lap ? sealNote : null}
                {immersive ? (
                  <Button variant={beats || lap ? tone : 'ghost'} size="lg" block className="mt-6" onClick={leave}>
                    {lap ? 'Back to seal' : beats ? 'Take the crown with this run' : 'Exit'}
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    canvasRef.current?.focus();
                    start();
                  }}
                  className="mt-3 h-10 text-sm font-semibold text-mute hover:text-white"
                >
                  {lap ? 'Try the lap again' : 'Run again'}
                </button>
              </>
            ) : (
              <>
                <p className="font-mono text-[11px] uppercase tracking-wider text-mute">{lapNo ? `Lap ${lapNo} of ${LANE.LAPS}` : 'Practice'}</p>
                <p className="mt-2 font-poster text-2xl font-black uppercase">Ready?</p>
                <p className="mt-2 text-sm text-mute">
                  {sealed === 0 ? 'Swipe or tap left and right to switch lanes. Grab the coins.' : 'Same road rules, a little faster.'}
                </p>
                {lap ? sealNote : null}
                <Button
                  variant={tone}
                  size="lg"
                  block
                  className="mt-6"
                  onClick={() => {
                    canvasRef.current?.focus();
                    start();
                  }}
                >
                  {startLabel}
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  const hudBar = (
    <div className="relative z-20 space-y-3 px-3 pb-3" style={{ paddingTop: immersive ? 'max(12px, env(safe-area-inset-top))' : '12px' }}>
      <div className="flex items-center justify-between">
        {immersive && phase !== 'playing' ? (
          <button type="button" onClick={leave} aria-label="Leave the game" className="grid h-11 w-11 place-items-center rounded-xl bg-ink-3 text-white">
            <X className="h-5 w-5" />
          </button>
        ) : (
          <span className="w-11" />
        )}
        <div className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Score</p>
          <p className={`font-poster text-3xl font-black tabular-nums leading-none ${shown > toBeat && toBeat > 0 ? 'text-gold' : ''}`}>{shown}</p>
        </div>
        <div className="w-11 text-right">
          <p className="font-mono text-[10px] uppercase text-mute">{lapNo ? 'Lap' : 'Run'}</p>
          <p className={`font-mono text-lg font-bold tabular-nums ${hud.seconds < 4 && phase === 'playing' ? 'text-danger' : ''}`}>{hud.seconds}s</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {lap ? <LapBoxes states={lapStates} tone={tone} size="sm" label="Your laps" /> : <span />}
        {lap && sealFace ? (
          <span
            className={`rounded-md px-2 py-1 font-mono text-[10px] font-bold ${sealFace === 'closed' || sealUrgent ? 'bg-danger/20 text-danger' : 'bg-gold/15 text-gold'}`}
          >
            {sealFace === 'closed' ? 'seal closed' : `seal in ${sealFace}`}
          </span>
        ) : null}
        {toBeat > 0 ? (
          <span className="rounded-md bg-ink-3 px-2 py-1 font-mono text-[10px] text-mute">
            beat <span className="font-bold text-white">{toBeat}</span>
          </span>
        ) : null}
      </div>
    </div>
  );

  const controls = (
    <div className="grid grid-cols-2 gap-3 p-3" style={{ paddingBottom: immersive ? 'max(12px, env(safe-area-inset-bottom))' : '12px' }}>
      <Button variant="ghost" size="xl" aria-label="Move left" onClick={() => steer(-1)} disabled={phase !== 'playing'}>
        <ChevronLeft className="h-7 w-7" />
      </Button>
      <Button variant="ghost" size="xl" aria-label="Move right" onClick={() => steer(1)} disabled={phase !== 'playing'}>
        <ChevronRight className="h-7 w-7" />
      </Button>
    </div>
  );

  if (!immersive) {
    // In the page: the road with its start card. Starting a lap takes it full screen.
    return <div className="flex h-[min(62vh,520px)] flex-col overflow-hidden rounded-2xl bg-ink-2">{road}</div>;
  }

  // Full screen, like a game app: the road in the middle, the run's numbers beside it on wide screens.
  const game = (
    <div className="fixed inset-0 z-[80] flex bg-ink" style={{ height: '100dvh' }}>
      <aside className="hidden w-80 flex-col justify-between border-r border-white/5 p-8 lg:flex">
        <div>
          <p className={`font-mono text-[11px] uppercase tracking-wider ${accent}`}>{tone === 'lime' ? 'Crown run' : 'Lane race duel'}</p>
          <h1 className="mt-2 font-poster text-2xl font-black uppercase">{title}</h1>
          <div className="mt-8 space-y-6">
            {toBeat > 0 ? (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Score to beat</p>
                <p className="font-poster text-4xl font-black tabular-nums">{toBeat}</p>
              </div>
            ) : null}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Your run</p>
              <p className={`font-poster text-4xl font-black tabular-nums ${accent}`}>{shown}</p>
            </div>
          </div>
        </div>
        <div className="space-y-2 text-sm text-mute">
          <p>
            <kbd className="rounded bg-ink-3 px-1.5 py-0.5 font-mono text-white">←</kbd> <kbd className="rounded bg-ink-3 px-1.5 py-0.5 font-mono text-white">→</kbd> switch lanes
          </p>
          <p>
            <kbd className="rounded bg-ink-3 px-1.5 py-0.5 font-mono text-white">Space</kbd> start a lap
          </p>
        </div>
      </aside>
      <div className="relative mx-auto flex h-full w-full max-w-[480px] flex-col">
        {hudBar}
        {road}
        {controls}
      </div>
      <aside className="hidden w-80 lg:block" aria-hidden="true" />
    </div>
  );
  return (
    <>
      <div className="h-[min(62vh,520px)]" aria-hidden />
      {createPortal(game, document.body)}
    </>
  );
}

/** Where the car sits on the road, as a share of its height: the line the rules check for hits. */
const CAR_TOP = 76;

function Car({ tone, crashed }: { tone: 'lime' | 'pink'; crashed: boolean }) {
  const body = crashed ? '#ff5a5a' : tone === 'lime' ? '#99ee2d' : '#ff56f6';
  return (
    <svg viewBox="0 0 40 64" className="h-full w-full drop-shadow-[0_6px_8px_rgba(0,0,0,0.6)]" aria-hidden="true">
      <rect x="2" y="10" width="7" height="14" rx="2" fill="#111" />
      <rect x="31" y="10" width="7" height="14" rx="2" fill="#111" />
      <rect x="2" y="42" width="7" height="14" rx="2" fill="#111" />
      <rect x="31" y="42" width="7" height="14" rx="2" fill="#111" />
      <path d="M8 8 Q20 0 32 8 L34 56 Q20 64 6 56Z" fill={body} />
      <path d="M11 20 Q20 15 29 20 L28 30 Q20 27 12 30Z" fill="#1d1d1d" />
      <rect x="18" y="34" width="4" height="22" rx="2" fill="#111" opacity="0.35" />
      <rect x="10" y="5" width="5" height="3" rx="1" fill="#fff" />
      <rect x="25" y="5" width="5" height="3" rx="1" fill="#fff" />
    </svg>
  );
}

function Barrier() {
  return (
    <svg viewBox="0 0 60 28" className="h-full w-full" aria-hidden="true">
      <rect x="1" y="2" width="58" height="20" rx="4" fill="#ff8a1f" stroke="#fff" strokeWidth="2" />
      <path d="M12 2 L4 22 M28 2 L20 22 M44 2 L36 22 M58 4 L52 22" stroke="#fff" strokeWidth="5" />
      <rect x="8" y="22" width="4" height="6" fill="#ddd" />
      <rect x="48" y="22" width="4" height="6" fill="#ddd" />
    </svg>
  );
}

function Coin() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#e1bf47" stroke="#9a7f22" strokeWidth="3" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="#fff3c4" strokeWidth="2" opacity="0.8" />
    </svg>
  );
}
