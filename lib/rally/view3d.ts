import { ITEM_IMG } from '@/lib/crowns/art';
import { CAR_COLORS, type RallyFrame } from '@/lib/rally/draw';
import { ITEMS, RALLY, SLICK_ITEM, type CarView } from '@/lib/rally/rules';
import { RaceView } from '@/lib/rally/nightline/RaceView';
import type { CarFrameState, HazardFrameState, ItemType, RaceEvent, RaceFrame, TrackData, TrackTheme } from '@/lib/rally/nightline/types';

/** Metres per rules unit. */
const METRES = 1 / (4 * RALLY.SCALE);
/** Further than this between two ticks is a car put back on the road, not driving: no smoothing. */
const JUMP_METRES = 8;
/** The Nightline car is about 4.6 m long; the rules' car is a circle 2 × CAR_RADIUS across. */
const CAR_SCALE = (2 * RALLY.CAR_RADIUS * METRES) / 4.6;
/** An item pad's radius on the road, as the rules' PAD_RADIUS. */
const PAD_RADIUS = 12 * RALLY.SCALE * METRES;
/**
 * The rules stop a car's middle WALL from the centre line; the barrier is drawn half a car's width
 * further out, so a car touches it rather than sinking into it.
 */
const BARRIER_METRES = RALLY.WALL * METRES + 1.3;
/** How high Switchback Hill climbs at the top of the lap. Drawing only: the rules are flat. */
const HILL_METRES = 9;

const THEMES: TrackTheme[] = ['harbour', 'switchback', 'oldtown'];
/** The rules' item numbers as Nightline's names, for the ones it draws. */
const ITEM_TYPES: (ItemType | null)[] = [null, 'ram', 'slick', 'jolt', 'barricade', 'crown', null, null, null];

/** A car's place on the road: where, which way, how fast. */
type Pose = { x: number; y: number; angle: number; speed: number };

/** What one car looked like a tick ago and now, to draw smoothly between the race's 20 ticks a second. */
type Smooth = { from: Pose; to: Pose; at: number; hp: number; wrecked: boolean; turn: number };

function poseOf(car: CarView): Pose {
  return { x: car.x * METRES, y: car.y * METRES, angle: car.angle, speed: car.speed * METRES * RALLY.TICK_HZ };
}

function turnBetween(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The rules' road as Nightline track data: same centre line, same widths, in metres. */
function trackOf(frame: RallyFrame): TrackData {
  const theme = THEMES[frame.map ?? 0] ?? 'harbour';
  const n = frame.track.length;
  return {
    id: `crowns-${frame.map ?? 'seed'}`,
    name: '',
    subtitle: '',
    theme,
    roadWidth: 2 * RALLY.HALF_WIDTH * METRES,
    wallDistance: BARRIER_METRES,
    waterSide: 'outside',
    // The rules' road has sharp corners; drawing it smoothed would put the walls in the wrong place.
    sharpCorners: true,
    points: frame.track.map((p, i) => ({
      x: p.x * METRES,
      y: p.y * METRES,
      // The hill rises to the top halfway round and falls back to the start.
      elevation: theme === 'switchback' ? (HILL_METRES * (1 - Math.cos((2 * Math.PI * i) / n))) / 2 : 0,
    })),
  };
}

/**
 * The race in 3D from behind your car, or behind the leader when watching, drawn with Nightline GT's
 * roads, scenery and car. It draws whatever frame it's handed, so practice and live races look the
 * same. The road is the rules' own centre line and width, so what you see is where the walls are.
 */
export class RallyView3D {
  private view: RaceView | null = null;
  private trackKey = '';
  private smooth: Smooth[] = [];
  private readonly map = document.createElement('canvas');
  /** The track from above, taken once its world is built: the minimap's background. */
  private overhead: ReturnType<RaceView['overheadPicture']> = null;

  constructor(private readonly container: HTMLElement) {
    // The small map of the whole road in the corner, over the 3D view.
    this.map.style.cssText =
      'position:absolute;z-index:2;right:16px;top:calc(env(safe-area-inset-top) + 76px);width:min(30vmin,150px);height:min(30vmin,150px);pointer-events:none;border-radius:14px;background:rgba(10,11,15,0.55)';
    container.appendChild(this.map);
  }

  /** Builds the world the first time a road is seen, and again if the road changes. */
  private prepare(frame: RallyFrame) {
    const first = frame.track[0];
    const key = `${frame.map ?? 'seed'}:${frame.track.length}:${first?.x}:${first?.y}`;
    if (key === this.trackKey || frame.track.length < 3) return;
    this.view?.dispose();
    this.view = new RaceView(this.container, trackOf(frame), { carScale: CAR_SCALE });
    // RaceView has just appended its canvas: lay it under the minimap and the HUD.
    const canvas = this.container.lastElementChild;
    if (canvas instanceof HTMLCanvasElement) {
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      canvas.setAttribute('aria-label', 'The race in 3D, from behind your car');
    }
    this.trackKey = key;
    this.smooth = [];
    this.overhead = null;
  }

  /** Whether the world is built: its models and road textures loaded. Until then nothing is drawn. */
  isReady(): boolean {
    return this.view?.isReady() ?? false;
  }

  /** Draws one frame. Call once per animation frame with the race as it stands. */
  draw(frame: RallyFrame) {
    this.prepare(frame);
    const now = performance.now();
    const events: RaceEvent[] = [];
    const leader = frame.cars.reduce((best, car, i) => (car.place < (frame.cars[best]?.place ?? Infinity) ? i : best), 0);
    const followed = frame.me ?? leader;

    const cars: CarFrameState[] = frame.cars.map((car, i) => {
      const pose = this.follow(i, car, now, events);
      const state = this.smooth[i]!;
      return {
        id: String(i),
        name: frame.names?.[i] ?? `Car ${i + 1}`,
        color: CAR_COLORS[i % CAR_COLORS.length]!,
        x: pose.x,
        y: pose.y,
        angle: pose.angle,
        speed: pose.speed,
        steer: Math.max(-1, Math.min(1, state.turn * 9)),
        health: (car.hp / RALLY.MAX_HP) * 100,
        lap: car.lap + 1,
        place: car.place + 1,
        item: ITEM_TYPES[car.item] ?? null,
        finished: car.finished != null,
        boosting: car.boosting,
        braking: pose.speed < state.from.speed - 0.5,
        ramming: car.ramming,
        crownActive: car.rushing,
        jolted: car.slipping,
        wrecked: car.wrecked,
        warded: car.warded,
        drafting: car.drafting,
        ghost: car.ghost,
        isPlayer: i === followed,
      };
    });

    const hazards: HazardFrameState[] = (frame.hazards ?? []).map((hazard, i) => ({
      id: `${hazard.kind}:${hazard.x}:${hazard.y}:${i}`,
      type: hazard.kind === SLICK_ITEM ? 'slick' : 'barricade',
      x: hazard.x * METRES,
      y: hazard.y * METRES,
      angle: this.acrossRoad(frame, hazard.x, hazard.y),
      size: hazard.kind === SLICK_ITEM ? 2 * 22 * RALLY.SCALE * METRES : undefined,
    }));

    const raceFrame: RaceFrame = {
      timeRemaining: 0,
      elapsed: 0,
      countdown: 0,
      phase: 'racing',
      cars,
      itemBoxes: (frame.pads ?? []).map((pad, i) => ({
        id: `${i}:${pad.item}`,
        x: pad.x * METRES,
        y: pad.y * METRES,
        active: !pad.empty,
        item: pad.item,
        color: ITEMS[pad.item]?.color,
        radius: PAD_RADIUS,
        image: ITEM_IMG[pad.item],
      })),
      hazards,
      events,
    };
    // Taken just before a frame, which then draws over the corner it borrowed.
    if (!this.overhead && this.view?.isReady()) this.overhead = this.view.overheadPicture();
    this.view?.draw(raceFrame);
    this.drawMap(frame);
  }

  /** Where car `i` is drawn now: between its last two ticks. Also notices crashes and wrecks. */
  private follow(i: number, car: CarView, now: number, events: RaceEvent[]): Pose {
    const next = poseOf(car);
    let state = this.smooth[i];
    if (!state) {
      state = { from: next, to: next, at: now, hp: car.hp, wrecked: car.wrecked, turn: 0 };
      this.smooth[i] = state;
    }
    if (next.x !== state.to.x || next.y !== state.to.y || next.angle !== state.to.angle) {
      const jump = Math.hypot(next.x - state.to.x, next.y - state.to.y) > JUMP_METRES;
      state.turn = jump ? 0 : turnBetween(state.to.angle, next.angle);
      state.from = jump ? next : this.blend(state, now);
      state.to = next;
      state.at = now;
    }
    if (car.hp < state.hp && !car.wrecked) events.push({ type: 'collision', x: next.x, y: next.y, carId: String(i), intensity: Math.min(1, (state.hp - car.hp) / 25) });
    if (car.wrecked && !state.wrecked) events.push({ type: 'wreck', x: next.x, y: next.y, carId: String(i), intensity: 1 });
    state.hp = car.hp;
    state.wrecked = car.wrecked;
    return this.blend(state, now);
  }

  private blend(state: Smooth, now: number): Pose {
    const t = Math.min(1, (now - state.at) / RALLY.TICK_MS);
    const { from, to } = state;
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      angle: from.angle + turnBetween(from.angle, to.angle) * t,
      speed: from.speed + (to.speed - from.speed) * t,
    };
  }

  /** A Barricade lies across the road where it was dropped. */
  private acrossRoad(frame: RallyFrame, x: number, y: number): number {
    const track = frame.track;
    let best = 0;
    let bestDistance = Infinity;
    track.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    const a = track[best]!;
    const b = track[(best + 1) % track.length]!;
    return Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
  }

  /** The whole road from above, with a dot for each car and a ring round yours. Until the picture of the
   * track is ready, the road is a line. */
  private drawMap(frame: RallyFrame) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(this.map.clientWidth * ratio);
    if (size <= 0) return;
    if (this.map.width !== size) {
      this.map.width = size;
      this.map.height = size;
    }
    const ctx = this.map.getContext('2d');
    if (!ctx || frame.track.length < 2) return;
    const overhead = this.overhead;
    if (overhead) {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(overhead.picture, 0, 0, size, size);
      const scale = size / overhead.span;
      this.drawCars(ctx, frame, size, (x, y) => [(x * METRES - overhead.x) * scale, (y * METRES - overhead.y) * scale]);
      return;
    }
    const xs = frame.track.map((p) => p.x);
    const ys = frame.track.map((p) => p.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = size * 0.14;
    const scale = Math.min((size - pad * 2) / (maxX - minX || 1), (size - pad * 2) / (maxY - minY || 1));
    const at = (x: number, y: number): [number, number] => [pad + (x - minX) * scale + (size - pad * 2 - (maxX - minX) * scale) / 2, pad + (y - minY) * scale + (size - pad * 2 - (maxY - minY) * scale) / 2];
    ctx.clearRect(0, 0, size, size);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    frame.track.forEach((p, i) => (i === 0 ? ctx.moveTo(...at(p.x, p.y)) : ctx.lineTo(...at(p.x, p.y))));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(3, size * 0.035);
    ctx.stroke();
    this.drawCars(ctx, frame, size, at);
  }

  private drawCars(ctx: CanvasRenderingContext2D, frame: RallyFrame, size: number, at: (x: number, y: number) => [number, number]) {
    frame.cars.forEach((car, i) => {
      const [x, y] = at(car.x, car.y);
      ctx.beginPath();
      ctx.arc(x, y, size * (i === frame.me ? 0.05 : 0.035), 0, Math.PI * 2);
      ctx.fillStyle = car.wrecked ? '#ff3b3b' : CAR_COLORS[i % CAR_COLORS.length]!;
      ctx.fill();
      if (i === frame.me) {
        ctx.lineWidth = size * 0.015;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    });
  }

  dispose() {
    this.view?.dispose();
    this.view = null;
    this.map.remove();
  }
}
