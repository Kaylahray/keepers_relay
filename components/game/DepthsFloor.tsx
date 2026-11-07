'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Heart, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LapBoxes, type LapState } from '@/components/ui/kit';
import { RelicBadges } from '@/components/game/DepthsScreens';
import type { DrivenLap } from '@/components/game/CrownRunDrive';
import type { LockedLap } from '@/lib/game/crown-run';
import { DEEP, DEPTHS, DOWN, LEFT, RIGHT, StepRecorder, UP, loadDepths, restore, type Depths } from '@/lib/game/depths';
import { drawDepths, snapshot, type Before, type Flash } from '@/lib/game/depths-draw';

type Props = {
  /** The floors locked so far. */
  floors: LockedLap[];
  /** This floor's map. */
  seed: bigint;
  /** The score to beat, or 0 when there is none. */
  toBeat?: number;
  onDone: (floor: DrivenLap) => void;
};

const TICK_MS = 1000 / DEPTHS.TICK_HZ;
const COUNTDOWN_MS = 2_400;
const HOLD_MS = 1_300;
/** A tapped step waits this many ticks for the player's legs to be ready, then is dropped. */
const TAP_TICKS = 3;
const KEYS: Record<string, number> = {
  ArrowUp: UP,
  ArrowRight: RIGHT,
  ArrowDown: DOWN,
  ArrowLeft: LEFT,
  w: UP,
  d: RIGHT,
  s: DOWN,
  a: LEFT,
};

type Hud = { score: number; seconds: number; hp: number; maxHp: number; gold: number; owned: number; key: boolean; deep: boolean; floor: number };

function readHud(run: Depths): Hud {
  return {
    score: run.score(),
    seconds: Math.ceil(Math.max(0, run.torch() - run.tick()) / DEPTHS.TICK_HZ),
    hp: Math.max(0, run.hp()),
    maxHp: run.maxHp(),
    gold: run.gold(),
    owned: run.owned(),
    key: run.hasKey(),
    deep: run.stairs() === DEEP,
    floor: run.floor(),
  };
}

/** Plays one floor on the wasm rules the chain replays. It fills its parent. */
export function DepthsFloor({ floors, seed, toBeat = 0, onDone }: Props) {
  const floorIndex = floors.length;
  const [phase, setPhase] = useState<'loading' | 'counting' | 'playing' | 'over'>('loading');
  const [loadError, setLoadError] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null);
  const [count, setCount] = useState(3);
  const [ending, setEnding] = useState<'cleared' | 'fallen' | 'dark' | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const heldRef = useRef<number | null>(null);
  const tapRef = useRef<{ dir: number; ticks: number } | null>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  // Loads the run, counts down, then plays the floor on fixed ticks, however fast the screen refreshes.
  useEffect(() => {
    let stop = false;
    let raf = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let before: Before | null = null;
    const flashes: Flash[] = [];
    let hurtAt: number | null = null;
    let carry = 0;
    let playing = false;

    const paint = (run: Depths, now: number) => {
      const canvas = canvasRef.current;
      const box = boxRef.current;
      if (!canvas || !box) return;
      const size = Math.floor(Math.min(box.clientWidth, box.clientHeight));
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== size * ratio) {
        canvas.width = size * ratio;
        canvas.height = size * ratio;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawDepths(ctx, size, run, {
        t: playing ? Math.min(1, carry / TICK_MS) : 1,
        now,
        before,
        flashes,
        hurtAgo: hurtAt == null ? null : now - hurtAt,
      });
    };

    const play = (run: Depths) => {
      const recorder = new StepRecorder();
      let at = performance.now();
      playing = true;
      const loop = (now: number) => {
        if (stop) return;
        carry += now - at;
        at = now;
        let steps = 0;
        // A slow frame catches up, a fast one waits.
        while (carry >= TICK_MS && !run.floorOver() && steps < 8) {
          carry -= TICK_MS;
          steps += 1;
          before = snapshot(run);
          const hp = run.hp();
          const slain = run.slain();
          const gold = run.gold();
          const tap = tapRef.current;
          const wanted = tap?.dir ?? heldRef.current;
          let dir: number | null = null;
          if (wanted != null && run.stepOk(wanted)) {
            dir = wanted;
            tapRef.current = null;
          } else if (tap) {
            tap.ticks -= 1;
            if (tap.ticks <= 0) tapRef.current = null;
          }
          if (dir != null) recorder.record(run.tick(), dir);
          run.step(dir);
          if (run.hp() < hp) hurtAt = now;
          if (run.slain() > slain || run.gold() > gold) {
            flashes.push({ x: run.x(), y: run.y(), until: now + 350, color: run.slain() > slain ? '#ff5a5a' : '#e1bf47', ring: true });
          }
        }
        while (flashes.length && flashes[0]!.until < now) flashes.shift();
        paint(run, now);
        setHud(readHud(run));
        if (run.floorOver()) {
          playing = false;
          const cleared = run.cleared();
          setEnding(cleared ? 'cleared' : run.fallen() ? 'fallen' : 'dark');
          setPhase('over');
          const floor: DrivenLap = { moves: recorder.moves(), score: run.score(), coins: run.gold(), crashed: !cleared, owned: run.owned() };
          timers.push(setTimeout(() => doneRef.current(floor), HOLD_MS));
          const linger = (t: number) => {
            if (stop) return;
            paint(run, t);
            raf = requestAnimationFrame(linger);
          };
          raf = requestAnimationFrame(linger);
          return;
        }
        raf = requestAnimationFrame(loop);
      };
      setPhase('playing');
      raf = requestAnimationFrame(loop);
    };

    loadDepths()
      .then((run) => {
        if (stop) return;
        restore(run, floors, seed);
        setHud(readHud(run));
        setPhase('counting');
        const idle = (now: number) => {
          if (stop || playing) return;
          paint(run, now);
          raf = requestAnimationFrame(idle);
        };
        raf = requestAnimationFrame(idle);
        [2, 1].forEach((value, i) => timers.push(setTimeout(() => setCount(value), ((i + 1) * COUNTDOWN_MS) / 3)));
        timers.push(
          setTimeout(() => {
            if (stop) return;
            cancelAnimationFrame(raf);
            play(run);
          }, COUNTDOWN_MS),
        );
      })
      .catch(() => {
        if (!stop) setLoadError(true);
      });
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
    // A floor is played once; the parent remounts this component for the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const press = useCallback((dir: number) => {
    heldRef.current = dir;
    tapRef.current = { dir, ticks: TAP_TICKS };
  }, []);
  const release = useCallback((dir: number) => {
    if (heldRef.current === dir) heldRef.current = null;
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const dir = KEYS[event.key];
      if (dir == null) return;
      event.preventDefault();
      if (!event.repeat) press(dir);
    };
    const up = (event: KeyboardEvent) => {
      const dir = KEYS[event.key];
      if (dir != null) release(dir);
    };
    const blur = () => {
      heldRef.current = null;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [press, release]);

  const states: LapState[] = Array.from({ length: DEPTHS.FLOORS }, (_, i) =>
    i < floorIndex ? 'done' : i === floorIndex ? (ending && ending !== 'cleared' ? 'crash' : 'current') : 'empty',
  );
  const pad = (dir: number, label: string, Icon: typeof ChevronUp, area: string) => (
    <button
      type="button"
      aria-label={label}
      disabled={phase !== 'playing'}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        press(dir);
      }}
      onPointerUp={() => release(dir)}
      onPointerCancel={() => release(dir)}
      className={`grid h-14 w-14 touch-none select-none place-items-center rounded-2xl bg-ink-3 text-white active:bg-lime active:text-ink disabled:opacity-40 ${area}`}
    >
      <Icon className="h-7 w-7" aria-hidden="true" />
    </button>
  );

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[560px] flex-col">
      <div className="relative z-20 space-y-2 px-3 pb-2" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="flex items-end justify-between">
          <div className="w-28">
            <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Floor {floorIndex + 1} · torch</p>
            <p className={`font-mono text-lg font-bold tabular-nums ${hud && hud.seconds <= 10 && phase === 'playing' ? 'text-danger' : 'text-fire'}`}>{hud?.seconds ?? 60}s</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Score</p>
            <p className={`font-poster text-3xl font-black tabular-nums leading-none ${toBeat > 0 && (hud?.score ?? 0) > toBeat ? 'text-gold' : ''}`}>{hud?.score ?? 0}</p>
          </div>
          <div className="w-28 text-right">
            <p className={`font-mono text-[10px] font-bold uppercase tracking-wider ${hud?.deep ? 'text-danger' : 'text-lime'}`}>{hud?.deep ? 'Deep floor' : 'Safe floor'}</p>
            {toBeat > 0 ? <p className="font-mono text-xs text-mute">beat <span className="font-bold text-white">{toBeat}</span></p> : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5" aria-label={`Health ${hud?.hp ?? 0} of ${hud?.maxHp ?? 0}`}>
            {Array.from({ length: hud?.maxHp ?? 10 }, (_, i) => (
              <Heart key={i} className={`h-3.5 w-3.5 ${i < (hud?.hp ?? 0) ? 'fill-danger text-danger' : 'text-white/20'}`} aria-hidden="true" />
            ))}
            {hud?.key ? <KeyRound className="ml-1 h-4 w-4 text-gold" aria-label="You carry a key" /> : null}
          </div>
          <RelicBadges owned={hud?.owned ?? 0} />
        </div>
        <LapBoxes states={states} size="sm" label="Your floors" />
      </div>

      <div ref={boxRef} role="application" aria-label="Crown Depths. Arrow keys or WASD move one tile; walking into a monster hits it." className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-[#09080c]">
        <canvas ref={canvasRef} className="block" aria-hidden="true" />
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
              <p className="font-mono text-xs uppercase text-mute">Lighting the torch…</p>
            ) : phase === 'counting' ? (
              <div>
                <p className="font-poster text-7xl font-black tabular-nums">{count}</p>
                <p className="mt-2 text-xs text-mute">Find the stairs before the torch dies.</p>
              </div>
            ) : (
              <p className={`font-poster text-4xl font-black uppercase ${ending === 'cleared' ? 'text-lime' : 'text-danger'}`}>
                {ending === 'cleared' ? `Floor ${floorIndex + 1} clear` : ending === 'fallen' ? 'You fell' : 'The torch went out'}
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-[repeat(3,3.5rem)] grid-rows-[repeat(2,3.5rem)] justify-center gap-1.5 p-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        {pad(UP, 'Step up', ChevronUp, 'col-start-2 row-start-1')}
        {pad(LEFT, 'Step left', ChevronLeft, 'col-start-1 row-start-2')}
        {pad(DOWN, 'Step down', ChevronDown, 'col-start-2 row-start-2')}
        {pad(RIGHT, 'Step right', ChevronRight, 'col-start-3 row-start-2')}
      </div>
    </div>
  );
}
