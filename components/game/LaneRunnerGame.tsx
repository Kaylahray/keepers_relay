'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LANE, loadLaneRunner, TapeRecorder, type LaneRunner } from '@/lib/game/lane-runner';

export type FinishedRun = { tape: Uint8Array; score: number; seed: bigint };

type Props = {
  /** The course. On chain it is the player's own seed for this match. */
  seed: bigint;
  /** The standing score, shown as the line to beat. */
  toBeat: number;
  onFinish: (run: FinishedRun) => void;
  /** Shown on the start screen. */
  startLabel?: string;
};

const TICK_MS = 1000 / LANE.TICK_HZ;
const COLORS = {
  road: '#0b0b12',
  lane: 'rgba(255,255,255,0.10)',
  block: '#ff56f6',
  blockEdge: '#ffd1fb',
  coin: '#e1bf47',
  player: '#99ee2d',
  horizon: '#406aff',
};

/**
 * Plays the lane runner on the same wasm rules the chain replays. Input is a lane target, applied
 * on the next tick and recorded as `tick ‖ lane`, which is exactly the tape the game script reads,
 * so the score here is the score the chain will compute.
 */
export function LaneRunnerGame({ seed, toBeat, onFinish, startLabel = 'Run' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runnerRef = useRef<LaneRunner | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'playing' | 'over'>('loading');
  const [hud, setHud] = useState({ score: 0, seconds: LANE.MAX_TICKS / LANE.TICK_HZ });
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
        runner.start(seed);
        setPhase('ready');
      })
      .catch(() => {
        if (!stop) setLoadError('The game could not load. Refresh to try again.');
      });
    return () => {
      stop = true;
    };
  }, [seed]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const runner = runnerRef.current;
    if (!canvas || !runner) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const horizonY = height * 0.12;
    const playerY = height * 0.86;
    const laneW = Math.min(width / 3.2, 150);
    const centerX = width / 2;
    // Distance 0 is the player's line, VIEW_DEPTH the horizon. Nearer rows are larger and lower.
    const project = (y: number) => {
      const z = Math.max(0, y) / LANE.VIEW_DEPTH;
      const s = 1 / (1 + 3 * z);
      return { s, sy: horizonY + (playerY - horizonY) * ((s - 0.25) / 0.75) };
    };
    const laneX = (lane: number, s: number) => centerX + (lane - 1) * laneW * s;

    ctx.fillStyle = COLORS.road;
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createLinearGradient(0, 0, 0, horizonY * 2);
    glow.addColorStop(0, 'rgba(64,106,255,0.35)');
    glow.addColorStop(1, 'rgba(64,106,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, horizonY * 2);

    ctx.strokeStyle = COLORS.lane;
    ctx.lineWidth = 1;
    for (const edge of [-1.5, -0.5, 0.5, 1.5]) {
      ctx.beginPath();
      ctx.moveTo(centerX + edge * laneW * 0.25, horizonY);
      ctx.lineTo(centerX + edge * laneW, playerY + 30);
      ctx.stroke();
    }

    const rows = runner.rows().slice().sort((a, b) => b.y - a.y);
    for (const row of rows) {
      const { s, sy } = project(row.y);
      const w = laneW * 0.86 * s;
      const h = Math.max(4, 26 * s);
      for (let lane = 0; lane < LANE.LANES; lane += 1) {
        if (row.blocked & (1 << lane)) {
          ctx.fillStyle = COLORS.block;
          ctx.fillRect(laneX(lane, s) - w / 2, sy - h, w, h);
          ctx.fillStyle = COLORS.blockEdge;
          ctx.fillRect(laneX(lane, s) - w / 2, sy - h, w, Math.max(1, h * 0.18));
        }
      }
      if (row.coin >= 0) {
        ctx.fillStyle = COLORS.coin;
        ctx.beginPath();
        ctx.arc(laneX(row.coin, s), sy - h / 2, Math.max(3, 12 * s), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const px = centerX + (runner.x() / LANE.LANE_W - 1) * laneW;
    ctx.fillStyle = runner.over() && runner.tick() < LANE.MAX_TICKS ? '#af2a3a' : COLORS.player;
    ctx.beginPath();
    ctx.moveTo(px, playerY - 34);
    ctx.lineTo(px + 22, playerY + 6);
    ctx.lineTo(px - 22, playerY + 6);
    ctx.closePath();
    ctx.fill();
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
    runner.start(seed);
    play.current = { target: 1, wanted: 1, recorder: new TapeRecorder(), frame: 0, carry: 0, at: performance.now() };
    setPhase('playing');
    setLast(null);

    const loop = (now: number) => {
      const state = play.current;
      if (!state) return;
      state.carry += now - state.at;
      state.at = now;
      // Fixed ticks, however fast the screen refreshes. A slow frame catches up, a fast one waits.
      let steps = 0;
      while (state.carry >= TICK_MS && !runner.over() && steps < 8) {
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
      setHud({ score: runner.score(), seconds: Math.ceil((LANE.MAX_TICKS - runner.tick()) / LANE.TICK_HZ) });
      if (runner.over()) {
        const run = { tape: state.recorder.tape(), score: runner.score(), seed };
        play.current = null;
        setLast(run.score);
        setPhase('over');
        finishRef.current(run);
        return;
      }
      state.frame = requestAnimationFrame(loop);
    };
    play.current.frame = requestAnimationFrame(loop);
  }, [draw, seed]);

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

  const beats = last != null && last > toBeat;

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="Lane runner. Left and right arrows change lane."
        onPointerDown={(event) => {
          if (phase !== 'playing') return;
          const box = event.currentTarget.getBoundingClientRect();
          steer(event.clientX - box.left < box.width / 2 ? -1 : 1);
        }}
        className="block h-[min(62vh,520px)] w-full touch-none select-none border border-white/10 outline-none focus:border-[#99ee2d]/60"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 font-mono text-[11px] uppercase">
        <span className="text-white">
          <span className="block text-[10px] text-white/45">Score</span>
          <span className="font-poster text-3xl leading-none text-[#99ee2d]">{hud.score}</span>
        </span>
        <span className="text-center text-white/60">
          <span className="block text-[10px] text-white/45">To beat</span>
          <span className="font-poster text-2xl leading-none text-[#e1bf47]">{toBeat}</span>
        </span>
        <span className="text-right text-white/60">
          <span className="block text-[10px] text-white/45">Run</span>
          <span className="font-poster text-2xl leading-none text-white">{hud.seconds}s</span>
        </span>
      </div>
      {phase !== 'playing' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 p-6 text-center">
          {loadError ? (
            <p className="text-sm text-[#ff8b98]">{loadError}</p>
          ) : phase === 'loading' ? (
            <p className="font-mono text-xs uppercase text-white/60">Loading the game…</p>
          ) : (
            <>
              {phase === 'over' && last != null ? (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">Run over</p>
                  <p className={`mt-1 font-poster text-6xl leading-none ${beats ? 'text-[#99ee2d]' : 'text-white'}`}>{last}</p>
                  <p className="mt-2 text-sm text-white/70">
                    {beats ? `That beats ${toBeat}.` : `${toBeat} still stands. Same course, run it again.`}
                  </p>
                </>
              ) : (
                <p className="max-w-xs text-sm text-white/70">
                  Dodge pink, grab gold. ← → or tap left and right.
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  canvasRef.current?.focus();
                  start();
                }}
                className="arena-cta mt-5 px-6 py-3 font-poster text-2xl uppercase leading-none"
              >
                {phase === 'over' ? 'Run again' : startLabel}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
