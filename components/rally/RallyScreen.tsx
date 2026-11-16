'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BrickWall, Camera, ChevronsRight, Crown, Droplets, Flame, Gem, HeartPulse, Map as MapIcon, Octagon, Shield, Volume2, VolumeX, Wind, X, Zap, type LucideIcon } from 'lucide-react';
import { ITEM_IMG } from '@/lib/crowns/art';
import { RallySound, saveMuted, savedMuted } from '@/lib/rally/sound';
import { drawRally, CAR_COLORS, type RallyFrame } from '@/lib/rally/draw';
import type { RallyView3D } from '@/lib/rally/view3d';
import { BOOST, BRAKE, ITEMS, LEFT, RALLY, RIGHT, USE } from '@/lib/rally/rules';

/** Each item's icon, by its number. */
export const ITEM_ICONS: (LucideIcon | null)[] = [null, ChevronsRight, Droplets, Zap, BrickWall, Crown, Shield, HeartPulse, Wind];

/** The bits a player is holding right now, from the keyboard and the on-screen pads. */
export function useRallyControls(onChange: (bits: number) => void, enabled: boolean) {
  const held = useRef({ keys: 0, pads: 0 });
  const last = useRef(0);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);

  // Only refs inside, so the controls stay the same object for the whole race.
  const { publish, controls } = useMemo(() => {
    const publish = () => {
      const bits = held.current.keys | held.current.pads;
      if (bits !== last.current) {
        last.current = bits;
        changed.current(bits);
      }
    };
    const pad = (bit: number) => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        held.current.pads |= bit;
        publish();
      },
      onPointerUp: () => {
        held.current.pads &= ~bit;
        publish();
      },
      onPointerCancel: () => {
        held.current.pads &= ~bit;
        publish();
      },
    });
    return { publish, controls: { pad, current: () => last.current } };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const map: Record<string, number> = { ArrowLeft: LEFT, a: LEFT, ArrowRight: RIGHT, d: RIGHT, ArrowUp: BOOST, w: BOOST, ' ': BOOST, ArrowDown: BRAKE, s: BRAKE, e: USE, f: USE, Shift: USE, Enter: USE };
    const down = (event: KeyboardEvent) => {
      const bit = map[event.key];
      if (!bit) return;
      event.preventDefault();
      held.current.keys |= bit;
      publish();
    };
    const up = (event: KeyboardEvent) => {
      const bit = map[event.key];
      if (!bit) return;
      held.current.keys &= ~bit;
      publish();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [enabled, publish]);

  return controls;
}

/** The held item, and the pad that fires it. Empty hands show an empty slot. */
function ItemSlot({ item, pad, big = false }: { item: number; pad: ReturnType<ReturnType<typeof useRallyControls>['pad']>; big?: boolean }) {
  const info = ITEMS[item];
  const Icon = ITEM_ICONS[item];
  const picture = ITEM_IMG[item];
  return (
    <button
      type="button"
      aria-label={info ? `Use ${info.name}` : 'No item: drive over a pad'}
      {...pad}
      disabled={!info}
      className={`relative grid place-items-center overflow-hidden rounded-3xl bg-black/60 ring-2 backdrop-blur-md transition-transform duration-100 active:scale-[0.92] ${big ? 'h-24 w-24' : 'h-[84px] w-[84px]'} ${info ? 'ring-lime' : 'ring-white/20'}`}
    >
      {info ? (
        <span key={item} className="hud-pop flex flex-col items-center">
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picture} alt="" className={`${big ? 'h-16 w-16' : 'h-14 w-14'} rounded-full object-cover`} />
          ) : Icon ? (
            <span className={`grid place-items-center rounded-full text-ink ${big ? 'h-16 w-16' : 'h-14 w-14'}`} style={{ background: info.color }}>
              <Icon className="h-8 w-8" aria-hidden="true" />
            </span>
          ) : null}
          <span className="-mt-1 font-display text-xs font-black uppercase tracking-wide">{info.name}</span>
        </span>
      ) : (
        <span className="font-display text-xs font-black uppercase text-fog">No item</span>
      )}
    </button>
  );
}

function ordinal(place: number): string {
  return ['1st', '2nd', '3rd', '4th'][place] ?? `${place + 1}th`;
}

type Props = {
  /** Called every animation frame for the frame to draw. */
  frameOf: () => RallyFrame | null;
  /** The pads and keys drive this car; null to only watch. */
  controls: ReturnType<typeof useRallyControls> | null;
  /** Big text over the road: a countdown, "Finish!". */
  banner?: ReactNode;
  /** Under the road's top bar: whose car is whose. */
  names?: string[];
  /** Seconds since the start, for the clock. */
  seconds: number;
  /** Shows a leave button at the top right. */
  onLeave?: () => void;
  leaveLabel?: string;
  /** A small label under the clock, like "Practice". */
  tag?: ReactNode;
  children?: ReactNode;
};

type View = '3d' | 'map';
const VIEW_KEY = 'crowns.rally.view';

function savedView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'map' ? 'map' : '3d';
  } catch {
    return '3d';
  }
}

/** The race on the full screen: the road in 3D or from above, a top bar (lap, place, health, time) and the pads. */
export function RallyScreen({ frameOf, controls, banner, names, seconds, onLeave, leaveLabel = 'Leave', tag, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const view3d = useRef<RallyView3D | null>(null);
  const [view, setView] = useState<View>(savedView);
  const [hud, setHud] = useState<{ lap: number; place: number; boosts: number; finished: boolean; me: number | null; hp: number; wrecked: boolean; kmh: number; item: number; shards: number } | null>(null);
  const frameRef = useRef(frameOf);
  const namesRef = useRef(names);
  const sound = useRef<RallySound | null>(null);
  const [muted, setMuted] = useState(savedMuted);

  // Sound starts on the first tap or key (the browser's rule) and stops when the race screen closes.
  useEffect(() => {
    sound.current = new RallySound(savedMuted());
    return () => {
      sound.current?.dispose();
      sound.current = null;
    };
  }, []);

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    saveMuted(next);
    sound.current?.setMuted(next);
  };
  useEffect(() => {
    frameRef.current = frameOf;
    namesRef.current = names;
  }, [frameOf, names]);

  const pickView = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered; it still switches.
    }
  };

  // The 3D view loads only when it's shown, and falls back to the map on a device without WebGL.
  useEffect(() => {
    if (view !== '3d') return;
    let live = true;
    import('@/lib/rally/view3d')
      .then(({ RallyView3D }) => {
        if (!live || !stageRef.current) return;
        view3d.current = new RallyView3D(stageRef.current);
      })
      .catch(() => live && setView('map'));
    return () => {
      live = false;
      view3d.current?.dispose();
      view3d.current = null;
    };
  }, [view]);

  useEffect(() => {
    let raf = 0;
    let lastHud = '';
    const paint = () => {
      raf = requestAnimationFrame(paint);
      const canvas = canvasRef.current;
      const frame = frameRef.current();
      if (!canvas || !frame) return;
      if (view3d.current) {
        try {
          view3d.current.draw(frame.names ? frame : { ...frame, names: namesRef.current });
        } catch {
          view3d.current.dispose();
          view3d.current = null;
          setView('map');
        }
      }
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * ratio);
      const h = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = view3d.current ? null : canvas.getContext('2d');
      if (ctx) drawRally(ctx, frame);
      const mine = frame.me != null ? frame.cars[frame.me] : undefined;
      sound.current?.update(mine);
      const next = mine
        ? {
            lap: Math.min(Math.max(mine.lap + 1, 1), RALLY.LAPS),
            place: mine.place,
            boosts: mine.boosts,
            finished: mine.finished != null,
            me: frame.me,
            hp: mine.hp,
            wrecked: mine.wrecked,
            item: mine.item,
            shards: mine.shards,
            // As the 3D world measures it: a car is about 5.5 m long.
            kmh: Math.round(((mine.speed * RALLY.TICK_HZ) / (4 * RALLY.SCALE)) * 3.6),
          }
        : null;
      const key = JSON.stringify(next);
      if (key !== lastHud) {
        lastHud = key;
        setHud(next);
      }
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);

  const clock = `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
  const hpPct = hud ? (hud.hp / RALLY.MAX_HP) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 select-none bg-ink text-chalk" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full ${view === '3d' ? 'invisible' : ''}`} aria-label="The race, seen from above" />
      <div ref={stageRef} className={`absolute inset-0 ${view === '3d' ? '' : 'hidden'}`} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent" />

      {/* Top left: place, lap, time, and who's who. */}
      <div className="pointer-events-none absolute left-0 top-0 p-4 sm:p-6" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        {hud ? (
          <div className="flex items-end gap-3">
            <p
              key={hud.place}
              className={`hud-pop origin-bottom-left font-display text-7xl font-black italic leading-[0.8] drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-8xl ${hud.place === 0 ? 'text-gold' : 'text-chalk'}`}
            >
              {hud.place + 1}
              <span className="text-4xl sm:text-5xl">{ordinal(hud.place).slice(-2)}</span>
            </p>
            {names && names.length > 0 ? <span className="mb-1 font-display text-xl font-black text-chalk/70">/ {names.length}</span> : null}
          </div>
        ) : controls ? null : (
          <p className="font-display text-5xl font-black uppercase leading-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">Watching</p>
        )}
        <div className="mt-3 flex items-center gap-3">
          {hud ? (
            <span className="rounded-lg bg-black/55 px-2.5 py-1 font-display text-xl font-black backdrop-blur">
              LAP <span className="text-lime">{hud.lap}</span>/{RALLY.LAPS}
            </span>
          ) : null}
          <span className="rounded-lg bg-black/55 px-2.5 py-1 font-display text-xl font-black tabular-nums backdrop-blur">{clock}</span>
        </div>
        {tag}
        {names && names.length > 0 ? (
          <ul className="mt-3 hidden space-y-1 md:block">
            {names.map((name, i) => (
              <li key={i} className="flex w-fit items-center gap-2 rounded-lg bg-black/55 px-2 py-1 font-display text-sm font-extrabold backdrop-blur">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAR_COLORS[i] }} />
                {name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Top right: leave, sound, view. */}
      <div className="absolute right-0 top-0 z-20 flex gap-2 p-4 sm:p-6" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        {onLeave ? (
          <HudButton label={leaveLabel} onClick={onLeave} wide>
            <X className="h-5 w-5" aria-hidden="true" /> <span className="hidden font-display text-lg font-black uppercase sm:inline">{leaveLabel}</span>
          </HudButton>
        ) : null}
        <HudButton label={muted ? 'Turn the sound on' : 'Mute the sound'} onClick={toggleSound} pressed={muted}>
          {muted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
        </HudButton>
        <HudButton label={view === '3d' ? 'Show the map from above' : 'Show the race in 3D'} onClick={() => pickView(view === '3d' ? 'map' : '3d')}>
          {view === '3d' ? <MapIcon className="h-5 w-5" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
        </HudButton>
      </div>

      {/* Health, speed and shards: under the place on phones, top centre on a wide screen. */}
      {hud ? (
        <div className={`pointer-events-none absolute left-4 w-44 sm:left-6 md:left-1/2 md:top-6 md:w-72 md:-translate-x-1/2 ${tag ? 'top-[calc(env(safe-area-inset-top)_+_196px)]' : 'top-[calc(env(safe-area-inset-top)_+_150px)]'}`}>
          <div className="flex items-center justify-between font-display text-sm font-black uppercase drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            <span className={hud.wrecked ? 'text-danger' : ''}>{hud.wrecked ? 'Wrecked' : 'Health'}</span>
            <span className="tabular-nums text-chalk/80">{hud.kmh} km/h</span>
            <span className="flex items-center gap-1 text-pink">
              <Gem className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
              <span key={hud.shards} className="hud-pop tabular-nums">
                {hud.shards}
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/15">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ease-snap ${hud.wrecked ? 'bg-danger' : hpPct > 50 ? 'bg-lime' : hpPct > 25 ? 'bg-gold' : 'bg-pink'}`}
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>
      ) : null}

      {hud?.wrecked ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center font-display text-6xl font-black uppercase text-danger drop-shadow-[0_3px_12px_rgba(0,0,0,0.7)]">Wrecked!</div>
      ) : null}

      {banner ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div key={String(banner)} className="hud-pop font-display text-[120px] font-black uppercase italic leading-none text-chalk drop-shadow-[0_6px_24px_rgba(0,0,0,0.7)] md:text-[200px]">
            {banner}
          </div>
        </div>
      ) : null}

      {controls && hud && !hud.finished ? (
        <>
          {/* Keyboard: the item slot and the keys. */}
          <div className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center md:pointer-fine:flex">
            <ItemSlot item={hud.item} pad={controls.pad(USE)} big />
            <p className="mt-3 text-sm font-semibold text-chalk/70 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
              ← → steer · ↑ boost ({hud.boosts}) · ↓ brake · E use item
            </p>
          </div>
          {/* Touch: steer on the left, brake, item and boost on the right. */}
          <div
            className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 md:pointer-fine:hidden"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex gap-3">
              <TouchPad label="Steer left" pad={controls.pad(LEFT)}>
                <ArrowLeft className="h-9 w-9" strokeWidth={3} aria-hidden="true" />
              </TouchPad>
              <TouchPad label="Steer right" pad={controls.pad(RIGHT)}>
                <ArrowRight className="h-9 w-9" strokeWidth={3} aria-hidden="true" />
              </TouchPad>
            </div>
            <div className="flex items-end gap-3">
              <TouchPad label="Brake" tone="pink" small pad={controls.pad(BRAKE)}>
                <Octagon className="h-7 w-7" strokeWidth={3} aria-hidden="true" />
              </TouchPad>
              <div className="flex flex-col items-center gap-3">
                <ItemSlot item={hud.item} pad={controls.pad(USE)} />
                <TouchPad label={`Boost, ${hud.boosts} left`} tone="lime" pad={controls.pad(BOOST)} disabled={hud.boosts === 0}>
                  <Flame className="h-9 w-9" aria-hidden="true" />
                  <span className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full bg-ink font-display text-sm font-black text-chalk">{hud.boosts}</span>
                </TouchPad>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {children}
    </div>
  );
}

type Pad = ReturnType<ReturnType<typeof useRallyControls>['pad']>;

function HudButton({ children, label, onClick, wide, pressed }: { children: ReactNode; label: string; onClick?: () => void; wide?: boolean; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex h-11 items-center justify-center gap-1.5 rounded-full bg-black/55 text-chalk ring-1 ring-white/15 backdrop-blur transition-[transform,background-color] duration-150 hover:bg-black/75 active:scale-95 ${wide ? 'px-3.5' : 'w-11'}`}
    >
      {children}
    </button>
  );
}

function TouchPad({ children, label, tone, small, pad, disabled }: { children: ReactNode; label: string; tone?: 'pink' | 'lime'; small?: boolean; pad: Pad; disabled?: boolean }) {
  const look = tone === 'pink' ? 'bg-pink/25 text-pink ring-pink/60' : tone === 'lime' ? 'bg-lime/25 text-lime ring-lime/60' : 'bg-white/10 text-chalk ring-white/30';
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      {...pad}
      className={`relative grid place-items-center rounded-full ring-2 backdrop-blur-md transition-transform duration-100 active:scale-[0.92] disabled:opacity-30 ${small ? 'h-[68px] w-[68px]' : 'h-[84px] w-[84px]'} ${look}`}
    >
      {children}
    </button>
  );
}
