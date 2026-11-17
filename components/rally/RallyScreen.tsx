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
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // The touch already ended: nothing to hold on to.
        }
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
      className={`relative grid place-items-center overflow-hidden bg-black/60 ring-2 backdrop-blur-md transition-transform duration-100 active:scale-[0.92] ${big ? 'h-24 w-24 rounded-3xl' : 'h-[clamp(52px,14vmin,70px)] w-[clamp(52px,14vmin,70px)] rounded-2xl'} ${info ? 'ring-lime' : 'ring-white/20'}`}
    >
      {info ? (
        <span key={item} className="hud-pop flex flex-col items-center">
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picture} alt="" className={`${big ? 'h-16 w-16' : 'h-[clamp(32px,9vmin,46px)] w-[clamp(32px,9vmin,46px)]'} rounded-full object-cover`} />
          ) : Icon ? (
            <span className={`grid place-items-center rounded-full text-ink ${big ? 'h-16 w-16' : 'h-[clamp(32px,9vmin,46px)] w-[clamp(32px,9vmin,46px)]'}`} style={{ background: info.color }}>
              <Icon className="h-8 w-8" aria-hidden="true" />
            </span>
          ) : null}
          <span className={`-mt-1 font-display font-black uppercase tracking-wide ${big ? 'text-xs' : 'text-[10px] leading-tight'}`}>{info.name}</span>
        </span>
      ) : (
        <span className="px-1 text-center font-display text-[10px] font-black uppercase leading-tight text-fog">No item</span>
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
  /** Told the map whose world is drawn, once it is, and null while one is loading. */
  onReady?: (map: number | null) => void;
  children?: ReactNode;
};

/** How long the "Got an item" note stays up. */
const PICKED_MS = 3_500;

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
export function RallyScreen({ frameOf, controls, banner, names, seconds, onLeave, leaveLabel = 'Leave', tag, onReady, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const view3d = useRef<RallyView3D | null>(null);
  const [view, setView] = useState<View>(savedView);
  const [hud, setHud] = useState<{ lap: number; place: number; boosts: number; finished: boolean; me: number | null; hp: number; wrecked: boolean; kmh: number; item: number; shards: number } | null>(null);
  const frameRef = useRef(frameOf);
  const namesRef = useRef(names);
  const sound = useRef<RallySound | null>(null);
  const [muted, setMuted] = useState(savedMuted);
  // The map whose world is drawn, or null while it loads: on a slow phone the road takes a while.
  const [readyMap, setReadyMap] = useState<number | null>(null);
  // The item this car just picked up, shown for a few seconds.
  const [picked, setPicked] = useState<{ item: number; at: number } | null>(null);
  const viewRef = useRef(view);
  const onReadyRef = useRef(onReady);

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
    viewRef.current = view;
    onReadyRef.current = onReady;
  }, [frameOf, names, view, onReady]);

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
    let lastReady: number | null | undefined;
    let held = 0;
    let shownAt = 0;
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
      // The map from above is drawn at once; the 3D world once its models and textures are in.
      const drawn = viewRef.current === 'map' || (view3d.current?.isReady() ?? false);
      const ready = drawn ? (frame.map ?? -1) : null;
      if (ready !== lastReady) {
        lastReady = ready;
        setReadyMap(ready);
        onReadyRef.current?.(ready);
      }
      const mine = frame.me != null ? frame.cars[frame.me] : undefined;
      sound.current?.update(mine);
      const item = mine?.item ?? 0;
      const now = performance.now();
      if (item !== held) {
        held = item;
        shownAt = item ? now : 0;
        setPicked(item ? { item, at: now } : null);
      } else if (shownAt && now - shownAt > PICKED_MS) {
        shownAt = 0;
        setPicked(null);
      }
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/60 to-transparent" />

      {/* Top left, one slim bar: place, lap and time, with health, speed and shards under it. The buttons keep the right. */}
      <div className="pointer-events-none absolute left-0 top-0 w-full pl-3 pr-[164px] sm:pl-5" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex h-11 w-fit max-w-full items-center gap-2.5 rounded-full bg-black/55 px-3.5 font-display font-black ring-1 ring-white/15 backdrop-blur">
          {hud ? (
            <span key={hud.place} className={`hud-pop text-2xl italic leading-none ${hud.place === 0 ? 'text-gold' : 'text-chalk'}`}>
              {ordinal(hud.place)}
              {names && names.length > 0 ? <span className="text-sm not-italic text-chalk/60">/{names.length}</span> : null}
            </span>
          ) : (
            <span className="text-lg uppercase">{controls ? 'Ready' : 'Watching'}</span>
          )}
          {hud ? (
            <span className="whitespace-nowrap text-base">
              LAP <span className="text-lime">{hud.lap}</span>/{RALLY.LAPS}
            </span>
          ) : null}
          <span className="text-base tabular-nums text-chalk/80">{clock}</span>
        </div>
        {hud ? (
          <div className="mt-2 flex w-full max-w-[260px] items-center gap-2 font-display text-xs font-black drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/15" role="img" aria-label={`Health ${Math.round(hpPct)}%`}>
              <div
                className={`h-full rounded-full transition-[width] duration-200 ease-snap ${hud.wrecked ? 'bg-danger' : hpPct > 50 ? 'bg-lime' : hpPct > 25 ? 'bg-gold' : 'bg-pink'}`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
            <span className="tabular-nums text-chalk/80">{hud.kmh} km/h</span>
            <span className="flex items-center gap-0.5 text-pink">
              <Gem className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              <span key={hud.shards} className="hud-pop tabular-nums">
                {hud.shards}
              </span>
            </span>
          </div>
        ) : null}
        {tag ? <div className="mt-2">{tag}</div> : null}
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
            <X className="h-5 w-5" aria-hidden="true" /> <span className="hidden font-display text-lg font-black uppercase sm:inline [@media(max-height:520px)]:hidden">{leaveLabel}</span>
          </HudButton>
        ) : null}
        <HudButton label={muted ? 'Turn the sound on' : 'Mute the sound'} onClick={toggleSound} pressed={muted}>
          {muted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
        </HudButton>
        <HudButton label={view === '3d' ? 'Show the map from above' : 'Show the race in 3D'} onClick={() => pickView(view === '3d' ? 'map' : '3d')}>
          {view === '3d' ? <MapIcon className="h-5 w-5" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
        </HudButton>
      </div>

      {/* A new item in hand: what it is, what it does, and how to fire it. */}
      {picked && controls && hud && !hud.finished ? (
        <div className="pointer-events-none absolute inset-x-0 top-[24%] flex justify-center px-4">
          <div key={picked.at} className="hud-pop flex max-w-sm items-center gap-3 rounded-2xl bg-black/70 px-4 py-3 ring-2 backdrop-blur" style={{ ['--tw-ring-color' as string]: ITEMS[picked.item]?.color }}>
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: ITEMS[picked.item]?.color }} />
            <div>
              <p className="font-display text-xl font-black uppercase leading-none">Got {ITEMS[picked.item]?.name}!</p>
              <p className="mt-1 text-sm text-chalk/80">
                {ITEMS[picked.item]?.about} <span className="font-bold text-lime md:pointer-fine:hidden">Tap it bottom right to fire.</span>
                <span className="hidden font-bold text-lime md:pointer-fine:inline">Press E to fire.</span>
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {hud?.wrecked ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center font-display text-6xl font-black uppercase text-danger drop-shadow-[0_3px_12px_rgba(0,0,0,0.7)]">Wrecked!</div>
      ) : null}

      {readyMap == null ? (
        <div className="pointer-events-none absolute inset-x-0 top-[58%] flex justify-center">
          <p className="animate-pulse rounded-full bg-black/60 px-4 py-2 font-display text-lg font-black uppercase tracking-wider backdrop-blur">Loading the track…</p>
        </div>
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
          {/* Touch anywhere: the left half of the screen steers left, the right half steers right. The buttons sit on top. */}
          <div className="absolute inset-0 flex md:pointer-fine:hidden" aria-hidden="true">
            <div className="h-full flex-1" {...controls.pad(LEFT)} />
            <div className="h-full flex-1" {...controls.pad(RIGHT)} />
          </div>
          {/* Touch: one thumb each side. Left thumb steers left with brake above it; right thumb steers right with boost and the item above it. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-[max(1rem,env(safe-area-inset-left))] md:pointer-fine:hidden [&_button]:pointer-events-auto"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}
          >
            <div className="flex flex-col items-start gap-2.5">
              <TouchPad label="Brake" tone="pink" small pad={controls.pad(BRAKE)}>
                <Octagon className="h-[45%] w-[45%]" strokeWidth={3} aria-hidden="true" />
              </TouchPad>
              <TouchPad label="Steer left" big pad={controls.pad(LEFT)}>
                <ArrowLeft className="h-[45%] w-[45%]" strokeWidth={3} aria-hidden="true" />
              </TouchPad>
            </div>
            <div className="flex flex-col items-end gap-2.5">
              <div className="flex items-end gap-2.5">
                <ItemSlot item={hud.item} pad={controls.pad(USE)} />
                <TouchPad label={`Boost, ${hud.boosts} left`} tone="lime" small pad={controls.pad(BOOST)} disabled={hud.boosts === 0}>
                  <Flame className="h-[45%] w-[45%]" aria-hidden="true" />
                  <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-ink font-display text-xs font-black text-chalk">{hud.boosts}</span>
                </TouchPad>
              </div>
              <TouchPad label="Steer right" big pad={controls.pad(RIGHT)}>
                <ArrowRight className="h-[45%] w-[45%]" strokeWidth={3} aria-hidden="true" />
              </TouchPad>
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

function TouchPad({ children, label, tone, small, big, pad, disabled }: { children: ReactNode; label: string; tone?: 'pink' | 'lime'; small?: boolean; big?: boolean; pad: Pad; disabled?: boolean }) {
  const look = tone === 'pink' ? 'bg-pink/25 text-pink ring-pink/60' : tone === 'lime' ? 'bg-lime/25 text-lime ring-lime/60' : 'bg-white/10 text-chalk ring-white/30';
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      {...pad}
      className={`relative grid place-items-center rounded-full ring-2 backdrop-blur-md transition-transform duration-100 active:scale-[0.92] disabled:opacity-30 ${small ? 'h-[clamp(44px,12vmin,58px)] w-[clamp(44px,12vmin,58px)]' : big ? 'h-[clamp(60px,17vmin,80px)] w-[clamp(60px,17vmin,80px)]' : 'h-[clamp(52px,14vmin,70px)] w-[clamp(52px,14vmin,70px)]'} ${look}`}
    >
      {children}
    </button>
  );
}
