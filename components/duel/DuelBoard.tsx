'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ArrowRight, Minus, Plus, Smartphone, Timer, X } from 'lucide-react';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { ArtilleryField2D, type FieldView } from '@/components/duel/ArtilleryField2D';
import { Avatar } from '@/components/duel/Avatar';
import { SIDE_COLORS } from '@/components/duel/colors';
import { usePhoneOrientation } from '@/components/duel/usePhoneOrientation';
import { Button } from '@/components/ui/Button';
import { HpBlocks } from '@/components/ui/kit';
import {
  MAX_HP,
  MAX_TURNS,
  MAX_WIND,
  fire,
  isPass,
  sideToMove,
  windFor,
  type ArtilleryState,
  type Shot,
  type ShotRecord,
  type ShotResult,
  type Side,
} from '@/lib/duel/artillery';

const DEFAULT_AIM: [Shot, Shot] = [
  { angle: 45, power: 60 },
  { angle: 135, power: 60 },
];
const REPORT_MS = 3_500;

type Props = {
  state: ArtilleryState;
  names: [string, string];
  /** The side this screen plays, shown as "You"; null when watching (or in a replay). */
  you?: Side | null;
  /** Each player's own profile picture, when they have one; otherwise a drawn face. */
  pictures?: [string | null, string | null];
  /** Called when another player's shot (or a replayed one) has finished playing out. */
  onIncomingDone?: () => void;
  /** False while it is not this screen's turn, or the duel is waiting or over. */
  canFire: boolean;
  /** Called once the shell has landed, with the shot to record. */
  onShot: (shot: ShotRecord) => void;
  /** This turn's wind, from the block the duel last landed in. */
  wind?: number;
  /** Shown over the field while firing is not possible. */
  idleNote?: string;
  /** A shot the other player made, to play out on this screen: `from` is the board before it. */
  incoming?: { id: string; from: ArtilleryState; shot: ShotRecord } | null;
  /** Something that went wrong (a shot the chain refused), shown over the field even in full screen. */
  alert?: string | null;
  /** Milliseconds left on the turn clock, shown under the wind; null when there is no clock. */
  timeLeft?: number | null;
  /** The game fills the whole screen, like a game app (live duels). False keeps it in the page (replays). */
  immersive?: boolean;
  /** A button under the message, for a fix the player can make from here. */
  action?: { label: string; onClick: () => void; disabled?: boolean } | null;
};

type Flight = { shot: ShotRecord; result: ShotResult; from: ArtilleryState; incoming: boolean };

/** The playable duel, laid out like a phone game: both players and their health across the top, the wind in the middle, drag on the field to aim, power and fire under your thumbs. */
export function DuelBoard({
  state: latest,
  names,
  you = null,
  canFire,
  onShot,
  idleNote,
  wind: givenWind,
  incoming,
  alert = null,
  timeLeft = null,
  pictures = [null, null],
  onIncomingDone,
  immersive = true,
  action = null,
}: Props) {
  // A live duel fills the screen on every device.
  const phone = usePhoneOrientation();
  const [leftGame, setLeftGame] = useState(false);
  const [upright, setUpright] = useState(false);
  const askToTurn = immersive && phone === 'portrait' && !upright && !leftGame;
  const full = immersive && !leftGame;
  const [aims, setAims] = useState<[Shot, Shot]>(DEFAULT_AIM);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [report, setReport] = useState<{ text: string; tone: 'good' | 'bad' | 'neutral'; at: number } | null>(null);
  const [scene, setScene] = useState<FieldView | null>(null);
  const [tankAt, setTankAt] = useState<{ x: number; y: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // While a shell is in the air the board shown is the one it was fired over.
  const state = flight?.from ?? latest;
  const moving = sideToMove(state);
  const aim = aims[moving];
  const wind = givenWind ?? windFor(state.seed, state.turn);
  const ready = canFire && latest.winner === null && !flight;

  // The other player's shot, played out once when it arrives.
  const played = useRef<string | null>(null);
  const incomingDone = useRef(onIncomingDone);
  useEffect(() => {
    incomingDone.current = onIncomingDone;
  }, [onIncomingDone]);
  useEffect(() => {
    if (!incoming || !isPass(incoming.shot) || played.current === incoming.id) return;
    played.current = incoming.id;
    incomingDone.current?.();
  }, [incoming]);
  useEffect(() => {
    if (!incoming || isPass(incoming.shot) || played.current === incoming.id) return;
    played.current = incoming.id;
    const result = fire(incoming.from, incoming.shot, incoming.shot.wind);
    setReport(null);
    setFlight({ shot: incoming.shot, result, from: incoming.from, incoming: true });
  }, [incoming]);

  // A shot's result shows for a few seconds, then gets out of the way.
  useEffect(() => {
    if (!report) return;
    const id = window.setTimeout(() => setReport((current) => (current?.at === report.at ? null : current)), REPORT_MS);
    return () => window.clearTimeout(id);
  }, [report]);

  // Where the aiming tank is on screen, for the aim line. The camera glides, so follow it.
  useEffect(() => {
    if (!ready || !scene) return;
    let raf = 0;
    const follow = () => {
      const at = scene.tankScreen(moving);
      setTankAt((current) => (current && Math.abs(current.x - at.x) < 0.5 && Math.abs(current.y - at.y) < 0.5 ? current : at));
      raf = window.requestAnimationFrame(follow);
    };
    follow();
    return () => window.cancelAnimationFrame(raf);
  }, [ready, scene, moving]);

  const setAim = useCallback(
    (change: Partial<Shot>) =>
      setAims((current) => {
        const next: [Shot, Shot] = [{ ...current[0] }, { ...current[1] }];
        const merged = { ...next[moving], ...change };
        next[moving] = {
          angle: Math.round(Math.min(180, Math.max(0, merged.angle))),
          power: Math.round(Math.min(100, Math.max(0, merged.power))),
        };
        return next;
      }),
    [moving],
  );

  const shoot = useCallback(() => {
    if (!ready) return;
    const result = fire(state, aim, wind);
    setReport(null);
    setFlight({ shot: { ...aim, wind }, result, from: state, incoming: false });
  }, [ready, state, aim, wind]);

  const landed = useCallback(() => {
    if (!flight) return;
    const { result, shot } = flight;
    const who = you === moving ? 'You' : names[moving];
    const target = moving === 0 ? 1 : 0;
    const text = !result.impact
      ? `${who} missed: off the field`
      : result.damage[target] > 0
        ? `${result.direct ? 'Direct hit! ' : 'Hit! '}−${result.damage[target]}${result.damage[moving] > 0 ? ` (−${result.damage[moving]} splash back)` : ''}`
        : result.damage[moving] > 0
          ? `${who} hit ${you === moving ? 'yourself' : 'themselves'}: −${result.damage[moving]}`
          : `${who} missed`;
    // Good news for this screen in lime, bad in red; a watcher sees the shooter's side of it.
    const hit = result.damage[target] > 0;
    const mine = you === null ? true : you === moving;
    const tone = hit ? (mine ? 'good' : 'bad') : result.damage[moving] > 0 ? (mine ? 'bad' : 'good') : 'neutral';
    setReport({ text, tone, at: Date.now() });
    setFlight(null);
    if (flight.incoming) onIncomingDone?.();
    else onShot(shot);
  }, [flight, names, moving, onShot, onIncomingDone, you]);

  /** Aim the barrel at the finger: the angle from the tank to the point touched. */
  const aimAt = useCallback(
    (event: ReactPointerEvent) => {
      const frame = frameRef.current;
      if (!frame || !scene) return;
      const rect = frame.getBoundingClientRect();
      const tank = scene.tankScreen(moving);
      const dx = event.clientX - rect.left - tank.x;
      const dy = tank.y - (event.clientY - rect.top);
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle < 0) angle = angle < -90 ? 180 : 0;
      setAim({ angle });
    },
    [scene, moving, setAim],
  );

  useEffect(() => {
    if (!ready) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const step = event.shiftKey ? 5 : 1;
      // Left and right turn the barrel toward that side of the screen.
      if (event.key === 'ArrowLeft') setAim({ angle: aim.angle + step });
      else if (event.key === 'ArrowRight') setAim({ angle: aim.angle - step });
      else if (event.key === 'ArrowUp') setAim({ power: aim.power + step });
      else if (event.key === 'ArrowDown') setAim({ power: aim.power - step });
      else if (event.key === ' ' || event.key === 'Enter') shoot();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, aim, setAim, shoot]);

  const tone = SIDE_COLORS[moving];
  const reach = 34 + aim.power * 0.9;
  const radians = (aim.angle * Math.PI) / 180;
  // A skipped turn is announced from the record itself: nothing flies.
  const skipped = incoming && isPass(incoming.shot) && !flight ? sideToMove(incoming.from) : null;
  const skipNote = skipped === null ? null : `${you === skipped ? 'You' : names[skipped]} ran out of time: turn skipped`;
  const note = !ready && !flight && !report ? idleNote : undefined;

  // Full screen, the page behind must not scroll under the player's thumbs.
  useEffect(() => {
    if (!full) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, [full]);

  if (immersive && leftGame) {
    return (
      <Button variant="fire" size="xl" block onClick={() => setLeftGame(false)}>
        Back to the game
      </Button>
    );
  }

  const elevation = Math.round(aim.angle <= 90 ? aim.angle : 180 - aim.angle);
  // Raising the barrel turns it away from the ground on the side it faces.
  const raise = moving === 0 ? 1 : -1;
  const message = report
    ? { text: report.text, tone: report.tone }
    : alert
      ? { text: alert, tone: 'bad' as const }
      : skipNote
        ? { text: skipNote, tone: 'bad' as const }
        : note
          ? { text: note, tone: /landing on chain|passing the turn/i.test(note) ? ('chain' as const) : ('neutral' as const) }
          : null;

  return (
    <div className="select-none">
      {askToTurn ? <TurnPhone onUpright={() => setUpright(true)} onLeave={() => setLeftGame(true)} /> : null}
      <div
        className={
          full
            ? 'fixed inset-0 z-[80] flex h-[100dvh] w-full flex-col overflow-hidden bg-ink'
            : 'flex w-full flex-col overflow-hidden rounded-2xl bg-ink-2'
        }
      >
        {/* Top bar: both players, and the wind, shot and clock between them */}
        <div className="flex items-center gap-2 px-2 py-1.5 md:gap-4 md:px-4 md:py-3">
          {full ? (
            <button
              type="button"
              aria-label="Leave the game screen"
              onClick={() => setLeftGame(true)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-3 text-white"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
          <PlayerHud side={0} name={you === 0 ? 'You' : names[0]} face={names[0]} picture={pictures[0]} hp={state.tanks[0].hp} active={state.winner === null && moving === 0} />
          <WindGauge wind={wind} shot={Math.min(state.turn + 1, MAX_TURNS)} timeLeft={timeLeft} />
          <PlayerHud side={1} name={you === 1 ? 'You' : names[1]} face={names[1]} picture={pictures[1]} hp={state.tanks[1].hp} active={state.winner === null && moving === 1} />
        </div>

        {/* The field */}
        <div
          ref={frameRef}
          className={full ? 'relative min-h-0 flex-1 overflow-hidden' : 'relative aspect-[16/10] max-h-[calc(100dvh-12rem)] w-full overflow-hidden lg:aspect-[16/9]'}
          style={{ touchAction: ready ? 'none' : 'auto', cursor: ready ? 'crosshair' : 'default' }}
          onPointerDown={(event) => {
            if (!ready) return;
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            aimAt(event);
          }}
          onPointerMove={(event) => {
            if (ready && dragging.current) aimAt(event);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
        >
          <ArtilleryField2D state={state} aimAngle={aim.angle} flight={flight?.result ?? null} onFlightDone={landed} onScene={setScene} />

          {/* The aim line from the barrel, with the angle at its tip */}
          {ready && tankAt ? (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              <line
                x1={tankAt.x}
                y1={tankAt.y}
                x2={tankAt.x + Math.cos(radians) * reach}
                y2={tankAt.y - Math.sin(radians) * reach}
                stroke="#fff"
                strokeWidth={4}
                strokeDasharray="2 10"
                strokeLinecap="round"
              />
              <circle cx={tankAt.x + Math.cos(radians) * reach} cy={tankAt.y - Math.sin(radians) * reach} r={4} fill={tone} />
              <text
                x={tankAt.x + Math.cos(radians) * (reach + 16)}
                y={tankAt.y - Math.sin(radians) * (reach + 16) + 4}
                textAnchor="middle"
                className="font-mono text-[12px] font-bold"
                fill="#fff"
                stroke="#000"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {elevation}°
              </text>
            </svg>
          ) : null}

          {/* What just happened, or what we are waiting for */}
          {message || action ? (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2 px-4" aria-live="polite">
              {message ? (
                <div className={`flex items-center gap-3 rounded-xl px-4 py-2.5 font-poster text-xs font-bold uppercase shadow-lg md:text-sm ${MESSAGE_TONES[message.tone]}`}>
                  {message.tone === 'chain' ? <ChainLoader inline title="" /> : null}
                  {message.text}
                </div>
              ) : null}
              {action ? (
                <Button variant="pink" size="sm" onClick={action.onClick} disabled={action.disabled} className="pointer-events-auto">
                  {action.label}
                </Button>
              ) : null}
            </div>
          ) : null}

          {ready && state.turn < 2 ? (
            <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink/70 px-3 py-1.5 text-xs font-semibold text-white">
              Drag on the field to aim
            </p>
          ) : null}

          {/* The duel is decided: say so over the field, and step out to the payout. */}
          {latest.winner !== null && !flight ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-ink/70 px-6 text-center">
              <p className="font-poster text-4xl font-black uppercase md:text-6xl">
                {latest.winner === 'draw' ? 'A draw' : you === latest.winner ? <span className="text-lime">You win!</span> : `${names[latest.winner]} wins`}
              </p>
              {immersive ? (
                <Button variant="pink" size="lg" onClick={() => setLeftGame(true)}>
                  See the result
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Bottom bar: angle, power and fire under the thumbs. Watchers and replays have nothing to aim. */}
        {you === null ? null : (
        <div className="flex items-center gap-3 px-3 py-2 md:gap-6 md:px-6 md:py-3">
          <div className="flex items-center gap-1.5" aria-label="Angle">
            <NudgeButton label="Lower angle" disabled={!ready} onClick={() => setAim({ angle: aim.angle - raise })}>
              <Minus className="h-5 w-5" />
            </NudgeButton>
            <div className="w-14 text-center">
              <p className="font-mono text-[9px] uppercase text-mute">Angle</p>
              <p className="font-poster text-base font-bold tabular-nums">{elevation}°</p>
            </div>
            <NudgeButton label="Raise angle" disabled={!ready} onClick={() => setAim({ angle: aim.angle + raise })}>
              <Plus className="h-5 w-5" />
            </NudgeButton>
          </div>
          <label className="flex min-w-0 flex-1 items-center gap-3">
            <span className="font-mono text-[9px] uppercase text-mute">Power</span>
            <input
              type="range"
              min={0}
              max={100}
              value={aim.power}
              disabled={!ready}
              onChange={(event) => setAim({ power: Number(event.target.value) })}
              className="duel-power min-w-0 flex-1 disabled:opacity-40"
              style={{ ['--fill' as string]: `${aim.power}%` }}
            />
            <span className="w-8 font-poster text-base font-bold tabular-nums">{aim.power}</span>
          </label>
          <Button variant="fire" size="lg" onClick={shoot} disabled={!ready} className="shrink-0">
            Fire
          </Button>
        </div>
        )}
      </div>
    </div>
  );
}

const MESSAGE_TONES = {
  good: 'bg-lime text-ink',
  bad: 'bg-danger text-ink',
  neutral: 'bg-ink/85 text-white',
  chain: 'bg-pink text-ink',
} as const;

/** One player across the top: face, name, and health as blocks that empty as they are hit. */
function PlayerHud({ side, name, face, picture, hp, active }: { side: Side; name: string; face: string; picture: string | null; hp: number; active: boolean }) {
  const tone = SIDE_COLORS[side];
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${side === 1 ? 'order-3 flex-row-reverse text-right' : ''}`}>
      <div className="rounded-[22%] transition" style={{ boxShadow: active ? `0 0 0 2px #111, 0 0 0 4px ${tone}` : undefined }}>
        <Avatar name={face} tone={tone} size={32} src={picture} />
      </div>
      <div className="min-w-0">
        <p className={`truncate text-xs font-bold ${active ? (side === 0 ? 'text-lime' : 'text-pink') : 'text-white'}`}>{name}</p>
        <div className="mt-1">
          <HpBlocks hp={hp} max={MAX_HP} tone={side === 0 ? 'lime' : 'pink'} size="sm" align={side === 1 ? 'right' : 'left'} />
        </div>
      </div>
    </div>
  );
}

/** The wind, top centre: a bar that grows out from the middle toward where it blows, with the shot and the clock. */
function WindGauge({ wind, shot, timeLeft }: { wind: number; shot: number; timeLeft: number | null }) {
  const share = (Math.abs(wind) / MAX_WIND) * 50;
  const Arrow = wind < 0 ? ArrowLeft : ArrowRight;
  return (
    <div className="order-2 flex shrink-0 flex-col items-center gap-1">
      <div className="flex items-center gap-2" aria-label={wind === 0 ? 'No wind' : `Wind ${Math.abs(wind)} to the ${wind < 0 ? 'left' : 'right'}`}>
        <span className="font-mono text-[10px] uppercase text-mute">Wind</span>
        <div className="relative h-2 w-20 rounded-full bg-white/15 md:w-28">
          <span className="absolute left-1/2 top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-white/50" />
          <span className="absolute top-0 h-full rounded-full bg-chain-soft transition-[width,left] duration-200" style={{ width: `${share}%`, left: wind < 0 ? `${50 - share}%` : '50%' }} />
        </div>
        <span className="inline-flex items-center gap-0.5 font-mono text-xs font-bold">
          {wind !== 0 ? <Arrow className="h-3.5 w-3.5 text-chain-soft" aria-hidden="true" /> : null}
          {Math.abs(wind)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] font-bold">
          Shot {shot}/{MAX_TURNS}
        </span>
        {timeLeft != null ? (
          <span className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold ${timeLeft <= 5_000 ? 'text-danger' : 'text-white'}`}>
            <Timer className="h-3.5 w-3.5" aria-hidden="true" />
            {clock(timeLeft)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function NudgeButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-11 w-11 place-items-center rounded-xl bg-ink-3 text-white active:bg-ink-4 disabled:opacity-40">
      {children}
    </button>
  );
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

/** Shown over the game on a phone held upright: it plays best sideways, but upright works too. */
function TurnPhone({ onUpright, onLeave }: { onUpright: () => void; onLeave: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-ink px-8 text-center">
      <button type="button" onClick={onLeave} aria-label="Leave the game screen" className="absolute left-3 top-3 grid h-11 w-11 place-items-center rounded-xl bg-ink-3 text-white">
        <X className="h-5 w-5" />
      </button>
      <Smartphone className="h-16 w-16 animate-[turn-phone_2.4s_ease-in-out_infinite] text-pink" aria-hidden="true" />
      <p className="mt-8 font-poster text-2xl font-black uppercase">Turn your phone sideways</p>
      <p className="mt-2 text-mute">Artillery plays best in landscape.</p>
      <Button variant="ghost" className="mt-8" onClick={onUpright}>
        Play upright anyway
      </Button>
    </div>
  );
}
