'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { RallyScreen, useRallyControls } from '@/components/rally/RallyScreen';
import { Button } from '@/components/ui/Button';
import { getCkbClient } from '@/lib/ckb/client';
import { ckbTxExplorerUrl } from '@/lib/ckb/explorer';
import { playersOf, type MatchSnapshot } from '@/lib/rally/chain';
import { RallyLink } from '@/lib/rally/link';
import { OwnMoves } from '@/lib/rally/moves';
import { COUNTDOWN_MS, INPUT_DELAY_TICKS, LOBBY_MS, type RallyPhase } from '@/lib/rally/protocol';
import { CAR_COLORS } from '@/lib/rally/draw';
import { loadRally, RALLY, type RallyEvent, type RallyRunner } from '@/lib/rally/rules';

type Props = {
  snapshot: MatchSnapshot;
  /** This phone's session key when it drives a car; null to watch. */
  session: `0x${string}` | null;
  /** A car's name, by its session key's lock hash. */
  nameOf: (key: string) => string;
  onLeave: () => void;
  /** The finish landed on chain (`paid`), or the relay gave up: time to read the chain again. */
  onEnded: (paid: boolean) => void;
};

type Relay = { phase: RallyPhase; lobbyEndsAt: number | null; startAt: number | null; cars: string[]; joined: string[]; note?: string; txHash?: string };

/** The last input a car holds at `tick`, from its events. */
function bitsAt(events: RallyEvent[], tick: number): { tick: number; bits: number } | null {
  for (let i = events.length - 1; i >= 0; i -= 1) if (events[i]!.tick <= tick) return events[i]!;
  return null;
}

/** Plays one more final tick, with the inputs each car holds by then. */
function stepConfirmed(loaded: RallyRunner, tapes: RallyEvent[][], held: MutableRefObject<number[]>, next: MutableRefObject<number[]>) {
  const tick = loaded.tick(0);
  tapes.forEach((events, car) => {
    const at = next.current[car] ?? 0;
    if (events[at]?.tick === tick) {
      held.current[car] = events[at]!.bits;
      next.current[car] = at + 1;
    }
  });
  loaded.step(0, held.current);
}

/** A live race on the full screen: drives this phone's car through the relay, and shows the others as the relay passes them on. */
export function RallyLive({ snapshot, session, nameOf, onLeave, onEnded }: Props) {
  const matchId = snapshot.matchId;
  const map = snapshot.match.map;
  const [runner, setRunner] = useState<RallyRunner | null>(null);
  const [relay, setRelay] = useState<Relay>({ phase: 'lobby', lobbyEndsAt: null, startAt: null, cars: [], joined: [] });
  const [key, setKey] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const linkRef = useRef<RallyLink | null>(null);
  const track = useRef<{ x: number; y: number }[]>([]);
  // The race as the relay has made it final: events per car, and how many ticks are played.
  const cars = useRef<string[]>([]);
  const tapes = useRef<RallyEvent[][]>([]);
  const confirmed = useRef(0);
  const held = useRef<number[]>([]);
  const next = useRef<number[]>([]);
  // This phone's inputs the relay hasn't passed back yet.
  const pending = useRef<RallyEvent[]>([]);
  // What this phone pressed, to sign its car's moves once the relay passes them back.
  const own = useRef<OwnMoves | null>(null);
  const relayStart = useRef<number | null>(null);
  const endedRef = useRef(onEnded);
  useEffect(() => {
    endedRef.current = onEnded;
  }, [onEnded]);

  const me = key != null ? relay.cars.indexOf(key) : -1;
  const myCar = me >= 0 ? me : null;

  const controls = useRallyControls(
    useCallback((bits: number) => {
      const link = linkRef.current;
      const start = relayStart.current;
      if (!link || link.key == null || start == null || !cars.current.includes(link.key)) return;
      const estimated = Math.max(Math.floor((link.now() - start) / RALLY.TICK_MS), confirmed.current);
      const tick = Math.max(estimated, 0) + INPUT_DELAY_TICKS;
      pending.current.push({ tick, bits });
      own.current?.press(tick, bits);
      link.input(tick, bits);
    }, []),
    myCar != null,
  );

  useEffect(() => {
    let live = true;
    loadRally()
      .then((loaded) => {
        if (!live) return;
        loaded.start(0, map, 1);
        track.current = loaded.track(0);
        setRunner(loaded);
      })
      .catch(() => live && setTrouble('The race could not load. Refresh to try again.'));
    return () => {
      live = false;
    };
  }, [map]);

  // The relay: listen, join with this phone's key, and take every message.
  useEffect(() => {
    if (!runner) return;
    own.current = session ? new OwnMoves(matchId, session) : null;
    const link = new RallyLink(
      matchId,
      (message) => {
        if (message.type === 'state') {
          relayStart.current = message.startAt;
          // The cars are set when the countdown starts: line the race up for them.
          if (message.cars.length > 0 && cars.current.join() !== message.cars.join()) {
            cars.current = message.cars;
            runner.start(0, map, message.cars.length);
            tapes.current = message.cars.map(() => []);
            held.current = message.cars.map(() => 0);
            next.current = message.cars.map(() => 0);
            confirmed.current = 0;
          }
          setRelay({ phase: message.phase, lobbyEndsAt: message.lobbyEndsAt, startAt: message.startAt, cars: message.cars, joined: message.joined, note: message.note, txHash: message.txHash });
          if (message.phase === 'done' || message.phase === 'failed') endedRef.current(message.phase === 'done');
        } else if (message.type === 'tick') {
          for (const [car, tick, bits] of message.ev) {
            const events = tapes.current[car];
            if (!events) continue;
            const last = events.at(-1);
            if (last && last.tick === tick) last.bits = bits;
            else if (!last || tick > last.tick) events.push({ tick, bits });
            if (link.key != null && cars.current[car] === link.key) {
              pending.current = pending.current.filter((mine) => mine.tick > tick);
            }
          }
          // Sign this car's moves as the relay has them, so the finish needs nobody online. Only moves
          // before the played tick: the relay may still change a move on a tick it hasn't played.
          const mine = link.key != null ? cars.current.indexOf(link.key) : -1;
          const played = mine >= 0 ? tapes.current[mine]!.filter((event) => event.tick < message.t) : [];
          // Every tick, since a move becomes final a tick or two after it arrives. sign() skips a repeat.
          const signed = mine >= 0 ? own.current?.sign(played) : null;
          if (signed) link.moves(signed.count, signed.signature);
          confirmed.current = message.t;
          if (cars.current.length > 0) while (runner.tick(0) < message.t && !runner.over(0)) stepConfirmed(runner, tapes.current, held, next);
        }
      },
      setTrouble,
    );
    linkRef.current = link;
    link.listen();
    if (session) {
      link
        .join(getCkbClient(), session)
        .then(setKey)
        .catch((cause) => setTrouble(cause instanceof Error ? cause.message : 'Could not join the race.'));
    }
    const clock = window.setInterval(() => setNow(link.now()), 200);
    return () => {
      window.clearInterval(clock);
      link.close();
      linkRef.current = null;
    };
  }, [runner, matchId, map, session]);

  // What to draw: the final race, then a guess a few ticks ahead with what each car is holding.
  const frameOf = useCallback(() => {
    const loaded = runner;
    const link = linkRef.current;
    if (!loaded || !link) return null;
    if (cars.current.length === 0) return { track: track.current, cars: [], me: null, map };
    loaded.copy(0, 1);
    const start = relayStart.current;
    const mine = link.key != null ? cars.current.indexOf(link.key) : -1;
    if (start != null && !loaded.over(0)) {
      const estimated = Math.floor((link.now() - start) / RALLY.TICK_MS);
      const until = Math.min(estimated, confirmed.current + 20);
      for (let tick = loaded.tick(1); tick < until && !loaded.over(1); tick += 1) {
        const inputs = tapes.current.map((events, car) => {
          const known = bitsAt(events, tick);
          if (car !== mine) return known?.bits ?? 0;
          const guessed = bitsAt(pending.current, tick);
          return guessed && (!known || guessed.tick >= known.tick) ? guessed.bits : (known?.bits ?? 0);
        });
        loaded.step(1, inputs);
      }
    }
    return { track: track.current, cars: cars.current.map((_, i) => loaded.car(1, i)), me: mine >= 0 ? mine : null, map, pads: loaded.pads(1), hazards: loaded.hazards(1) };
  }, [runner, map]);

  // Until the relay's clock has ticked once, now is 0 and any gap to it would be a timestamp.
  const left = relay.startAt == null || now === 0 ? null : relay.startAt - now;
  const banner =
    relay.phase === 'countdown' && left != null && left > 0 && left <= COUNTDOWN_MS
      ? Math.ceil(left / 1000)
      : relay.phase === 'racing' && left != null && left > -800
        ? 'Go!'
        : null;
  const seconds = relay.phase === 'racing' || relay.phase === 'settling' ? (runner?.tick(0) ?? 0) / RALLY.TICK_HZ : 0;
  const shownNames = relay.cars.map((car, i) => (i === myCar ? `${nameOf(car)} (you)` : nameOf(car)));
  const lobbyLeft = relay.lobbyEndsAt == null || now === 0 ? null : Math.max(0, Math.ceil((relay.lobbyEndsAt - now) / 1000));

  let panel: ReactNode = null;
  if (trouble && relay.phase !== 'done') {
    panel = <p className="rounded-2xl bg-danger/20 px-4 py-3 font-semibold text-danger backdrop-blur">{trouble}</p>;
  }
  if (relay.phase === 'lobby') {
    panel = (
      <LobbyPanel
        left={lobbyLeft}
        total={snapshot.match.wait ? snapshot.match.wait * 1000 : LOBBY_MS}
        // The relay names the cars at the countdown; until then, the seats on chain.
        cars={playersOf(snapshot).map((player) => player.key.toLowerCase()).map((car) => ({ name: nameOf(car), here: relay.joined.includes(car) }))}
        trouble={trouble}
      />
    );
  } else if (relay.phase === 'settling') {
    panel = <Overlay title="Finish!" note={relay.note ?? 'Checking the race and paying the winner. You can leave: it happens on its own.'} />;
  } else if (relay.phase === 'done' || relay.phase === 'failed') {
    panel = (
      <Overlay title={relay.phase === 'done' ? 'Paid!' : 'Not paid yet'} note={relay.note ?? (relay.phase === 'done' ? 'The race was checked and the winner was paid.' : 'The result could not be sent.')}>
        {relay.txHash ? (
          <a href={ckbTxExplorerUrl(relay.txHash)} target="_blank" rel="noreferrer" className="mt-3 block text-sm font-semibold text-lime underline">
            View receipt
          </a>
        ) : null}
        <Button variant="lime" size="lg" block className="mt-5" onClick={onLeave}>
          Back to the match
        </Button>
      </Overlay>
    );
  }

  return (
    <RallyScreen frameOf={frameOf} controls={relay.phase === 'racing' && myCar != null ? controls : null} banner={banner} names={shownNames} seconds={seconds} onLeave={onLeave}>
      {panel && (relay.phase === 'racing' || relay.phase === 'countdown') ? <div className="absolute inset-x-3 bottom-28">{panel}</div> : panel}
    </RallyScreen>
  );
}

function Overlay({ title, note, children }: { title: string; note: string; children?: ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-ink/75 px-5 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-line bg-ink-2 px-6 py-8 text-center">
        <p className="font-display text-5xl font-black uppercase leading-[0.9]">{title}</p>
        <p className="mt-3 text-fog">{note}</p>
        {children}
      </div>
    </div>
  );
}

/** Before the start: the real track shows through, with a big clock and who's connected. */
function LobbyPanel({
  left,
  total,
  cars,
  trouble,
}: {
  left: number | null;
  total: number;
  cars: { name: string; here: boolean }[];
  trouble: string | null;
}) {
  const here = cars.filter((car) => car.here).length;
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-gradient-to-t from-ink via-ink/75 to-ink/20 sm:items-center">
      <div className="mx-auto w-full max-w-[1100px] px-5 pb-10 sm:px-8">
        <p className="font-display text-lg font-extrabold uppercase text-lime">Waiting for drivers · {here}/{cars.length} here</p>
        <p className="mt-1 font-display text-2xl font-black uppercase leading-none sm:text-3xl">Starts in</p>
        <p key={left ?? 'none'} className={`font-display text-[104px] font-black italic leading-[0.85] tabular-nums sm:text-[168px] ${left != null && left <= 30 ? 'text-pink' : ''}`}>
          {left != null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '–:––'}
        </p>
        <div className="mt-4 h-2 max-w-xl overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-lime transition-[width] duration-1000 ease-linear" style={{ width: `${left != null ? Math.min(100, ((left * 1000) / total) * 100) : 0}%` }} />
        </div>
        <ul className="mt-6 flex flex-wrap gap-2">
          {cars.map((car, i) => (
            <li key={i} className={`flex items-center gap-2 rounded-full px-3 py-1.5 font-display text-lg font-extrabold backdrop-blur ${car.here ? 'bg-black/60 text-chalk' : 'bg-black/30 text-fog'}`}>
              <span className="h-3 w-3 rounded-full" style={{ background: CAR_COLORS[i], opacity: car.here ? 1 : 0.35 }} />
              {car.name}
              {car.here ? null : <span className="text-sm font-bold">· not here yet</span>}
            </li>
          ))}
        </ul>
        <p className="mt-5 max-w-xl text-chalk/80">The race starts for everyone at once when the clock runs out. A car whose driver isn’t here sits on the line.</p>
        {trouble ? <p className="mt-3 text-danger">{trouble}</p> : null}
      </div>
    </div>
  );
}
