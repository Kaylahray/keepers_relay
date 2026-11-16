'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { MAP_IMG } from '@/lib/crowns/art';
import { RallyScreen, useRallyControls } from '@/components/rally/RallyScreen';
import { Button } from '@/components/ui/Button';
import { CAR_COLORS } from '@/lib/rally/draw';
import { loadRally, mapName, MAPS, RALLY, type RallyRunner } from '@/lib/rally/rules';

const COUNTDOWN_MS = 3_000;
/** You and two bots. */
const CARS = 3;
const NAMES = ['You', 'Bot Volt', 'Bot Rook'];

function lapClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

/** The bots' inputs, then yours in front. */
function inputs(runner: RallyRunner, mine: number): number[] {
  return [mine, ...Array.from({ length: CARS - 1 }, (_, i) => runner.bot(0, i + 1))];
}

/** A free race against bots on the named maps, on the same rules as a match. Nothing goes on chain. */
export function RallyPractice() {
  const router = useRouter();
  const [runner, setRunner] = useState<RallyRunner | null>(null);
  const [failed, setFailed] = useState(false);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  // Every car at the end, yours first: its place and finish time.
  const [result, setResult] = useState<{ place: number; seconds: number | null }[] | null>(null);
  const [map, setMap] = useState(0);
  const track = useRef<{ x: number; y: number }[]>([]);
  const controls = useRallyControls(() => {}, runner != null);

  // The next map each round, then the countdown.
  const startRound = useCallback((loaded: RallyRunner, next: number) => {
    setMap(next);
    loaded.start(0, next, CARS);
    track.current = loaded.track(0);
    setResult(null);
    // The clock and the start from the same moment, so the countdown opens on 3, not on a timestamp.
    const at = Date.now();
    setNow(at);
    setStartAt(at + COUNTDOWN_MS);
  }, []);

  useEffect(() => {
    let live = true;
    loadRally()
      .then((loaded) => {
        if (!live) return;
        // ?map=0, 1 or 2 practises that track; otherwise a random one.
        const asked = Number(new URLSearchParams(window.location.search).get('map'));
        startRound(loaded, Number.isInteger(asked) && asked >= 0 && asked < MAPS.length && window.location.search.includes('map=') ? asked : Math.floor(Math.random() * MAPS.length));
        setRunner(loaded);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [startRound]);

  // Fixed ticks, however fast the screen refreshes.
  useEffect(() => {
    if (!runner || startAt == null) return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      const target = Math.floor((at - startAt) / RALLY.TICK_MS);
      while (runner.tick(0) < target && !runner.over(0)) runner.step(0, inputs(runner, controls.current()));
      const me = runner.car(0, 0);
      if (runner.over(0) || me.finished != null) {
        window.clearInterval(timer);
        // Let the bots finish too, so the places are final.
        while (!runner.over(0)) runner.step(0, inputs(runner, 0));
        setResult(
          Array.from({ length: CARS }, (_, i) => {
            const car = runner.car(0, i);
            return { place: car.place, seconds: car.finished != null ? car.finished / RALLY.TICK_HZ : null };
          }),
        );
      }
    }, RALLY.TICK_MS / 2);
    return () => window.clearInterval(timer);
  }, [runner, startAt, controls]);

  const frameOf = useCallback(
    () => (runner ? { track: track.current, cars: Array.from({ length: CARS }, (_, i) => runner.car(0, i)), me: 0, map, pads: runner.pads(0), hazards: runner.hazards(0) } : null),
    [runner, map],
  );

  if (failed) {
    return <p className="mx-auto max-w-md px-5 pt-24 text-center text-fog">The race could not load. Refresh to try again.</p>;
  }

  const left = startAt == null ? 0 : startAt - now;
  const banner = left > COUNTDOWN_MS ? null : left > 0 ? Math.ceil(left / 1000) : left > -800 ? 'Go!' : null;
  const seconds = startAt == null || left > 0 ? 0 : (runner?.tick(0) ?? 0) / RALLY.TICK_HZ;

  const mine = result?.[0];
  const order = result ? result.map((car, i) => ({ ...car, i })).sort((x, y) => x.place - y.place) : [];

  return (
    <RallyScreen
      frameOf={frameOf}
      controls={result ? null : controls}
      banner={result ? null : banner}
      names={NAMES}
      seconds={seconds}
      onLeave={() => router.push('/rally')}
      leaveLabel="Leave practice"
      tag={<span className="mt-3 inline-block rounded-md bg-pink px-2 py-0.5 font-display text-sm font-black uppercase text-ink">Practice · free</span>}
    >
      {mine ? (
        <div className="absolute inset-0 z-10 overflow-y-auto bg-ink">
          <div className="absolute inset-x-0 top-0 -z-10 h-[360px] overflow-hidden sm:h-[440px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MAP_IMG[map]} alt="" className="h-full w-full object-cover object-top" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-ink/10" />
          </div>
          <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-40 sm:px-8 sm:pt-56">
            <p className="font-display text-sm font-extrabold uppercase tracking-wider text-pink">Practice finished · {mapName(map)}</p>
            <p className="hud-pop mt-2 font-display text-[96px] font-black leading-[0.8] tabular-nums sm:text-[150px]">{mine.seconds != null ? lapClock(mine.seconds) : 'DNF'}</p>
            <p className="mt-3 text-lg text-chalk/85">
              {mine.seconds == null ? 'Time ran out before your last lap.' : mine.place === 0 ? 'You beat both bots.' : `You came ${['1st', '2nd', '3rd'][mine.place] ?? 'last'}.`} {RALLY.LAPS} laps.
            </p>

            <ol className="mt-10 divide-y divide-line border-y border-line">
              {order.map((car, rank) => (
                <li key={car.i} className="flex items-center gap-4 py-3.5">
                  <span className="w-6 font-display text-2xl font-black text-fog">{rank + 1}</span>
                  <Avatar name={NAMES[car.i]!} tone={CAR_COLORS[car.i]} size={40} src={null} />
                  <span className={`flex-1 font-display text-xl font-extrabold ${car.i === 0 ? 'text-lime' : ''}`}>{NAMES[car.i]}</span>
                  <span className="font-display text-xl font-black tabular-nums">{car.seconds != null ? lapClock(car.seconds) : 'DNF'}</span>
                </li>
              ))}
            </ol>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button size="xl" onClick={() => runner && startRound(runner, (map + 1) % MAPS.length)}>
                <RotateCcw className="h-6 w-6" aria-hidden="true" /> Race the next track
              </Button>
              <Button size="xl" variant="ghost" href="/rally">
                Race for CKB
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </RallyScreen>
  );
}
