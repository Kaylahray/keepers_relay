'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { RallyScreen } from '@/components/rally/RallyScreen';
import { CAR_COLORS } from '@/lib/rally/draw';
import { tapesOf } from '@/lib/rally/result';
import { loadRally, RALLY, playTo, type RallyRunner } from '@/lib/rally/rules';

const SPEEDS = [1, 2, 4] as const;

/**
 * A finished race played again on the full screen, from the moves its finish transaction put on chain.
 * The same rules the chain ran drive every car, so this is the race the chain paid on, tick for tick.
 */
export function RallyReplay({ record, map, names, follow: first, onClose }: { record: Uint8Array; map: number; names: string[]; follow: number; onClose: () => void }) {
  const tapes = useMemo(() => tapesOf(record), [record]);
  const [runner, setRunner] = useState<RallyRunner | null>(null);
  const [failed, setFailed] = useState(false);
  const [follow, setFollow] = useState(first);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  // Playback: the tick it has reached, as a fraction, and when it last moved on.
  const target = useRef(0);
  const last = useRef<number | null>(null);
  const held = useRef<number[]>([]);
  const next = useRef<number[]>([]);
  const ready = useRef(false);
  const track = useRef<{ x: number; y: number }[]>([]);
  const play = useRef({ speed: 1, paused: false });

  useEffect(() => {
    play.current = { speed, paused };
  }, [speed, paused]);

  useEffect(() => {
    let live = true;
    loadRally()
      .then((loaded) => {
        if (!live) return;
        loaded.start(0, map, tapes.length);
        track.current = loaded.track(0);
        setRunner(loaded);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [map, tapes]);

  // The clock and the buttons follow the race a few times a second.
  useEffect(() => {
    if (!runner) return;
    const clock = window.setInterval(() => setTick(runner.tick(0)), 100);
    return () => window.clearInterval(clock);
  }, [runner]);

  const restart = useCallback(() => {
    if (!runner) return;
    runner.start(0, map, tapes.length);
    target.current = 0;
    held.current = [];
    next.current = [];
    last.current = null;
    setTick(0);
    setPaused(false);
  }, [runner, map, tapes]);

  const frameOf = useCallback(() => {
    if (!runner) return null;
    const now = performance.now();
    // Nothing moves until the road is drawn, so a slow phone doesn't miss the start.
    if (ready.current && !play.current.paused && last.current != null) target.current += ((now - last.current) / RALLY.TICK_MS) * play.current.speed;
    last.current = now;
    playTo(runner, 0, tapes, Math.floor(target.current), held.current, next.current);
    return { track: track.current, cars: tapes.map((_, i) => runner.car(0, i)), me: follow, names, map, pads: runner.pads(0), hazards: runner.hazards(0) };
  }, [runner, tapes, follow, names, map]);

  const onReady = useCallback((drawn: number | null) => {
    ready.current = drawn != null;
  }, []);

  const over = runner?.over(0) ?? false;
  const button = 'flex h-11 items-center justify-center gap-1.5 rounded-full bg-black/60 px-4 font-display text-base font-black uppercase text-chalk ring-1 ring-white/15 backdrop-blur transition-colors duration-150 hover:bg-black/80';

  return (
    <RallyScreen
      frameOf={frameOf}
      controls={null}
      names={names}
      seconds={tick / RALLY.TICK_HZ}
      onLeave={onClose}
      leaveLabel="Close"
      onReady={onReady}
      tag={<span className="inline-block rounded-md bg-lime px-1.5 py-0.5 font-display text-xs font-black uppercase text-ink">Replay from chain</span>}
    >
      <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 px-3 sm:px-6" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        {failed ? <p className="rounded-2xl bg-danger/20 px-4 py-3 font-semibold text-danger backdrop-blur">The replay could not load. Refresh to try again.</p> : null}
        {/* Whose car the camera follows. */}
        <div className="flex flex-wrap justify-center gap-2">
          {names.map((name, car) => (
            <button
              key={car}
              type="button"
              onClick={() => setFollow(car)}
              aria-pressed={follow === car}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 font-display text-sm font-extrabold backdrop-blur transition-colors duration-150 ${follow === car ? 'bg-chalk text-ink' : 'bg-black/60 text-chalk hover:bg-black/80'}`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAR_COLORS[car % CAR_COLORS.length] }} />
              {name}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2">
          {over ? (
            <button type="button" className={button} onClick={restart}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Watch again
            </button>
          ) : (
            <>
              <button type="button" className={`${button} w-11 px-0`} onClick={() => setPaused((was) => !was)} aria-label={paused ? 'Play' : 'Pause'}>
                {paused ? <Play className="h-5 w-5" aria-hidden="true" /> : <Pause className="h-5 w-5" aria-hidden="true" />}
              </button>
              <button type="button" className={`${button} w-11 px-0`} onClick={restart} aria-label="Start again">
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          )}
          {SPEEDS.map((choice) => (
            <button key={choice} type="button" onClick={() => setSpeed(choice)} aria-pressed={speed === choice} className={`${button} w-14 px-0 ${speed === choice ? '!bg-lime !text-ink' : ''}`}>
              {choice}×
            </button>
          ))}
        </div>
      </div>
    </RallyScreen>
  );
}
