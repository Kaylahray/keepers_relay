import { ITEMS, RALLY, SLICK_ITEM, type CarView, type HazardView, type PadView } from '@/lib/rally/rules';

/** Car paint by car: the host lime, then each seat pink, gold, blue and orange. */
export const CAR_COLORS = ['#99ee2d', '#ff56f6', '#e1bf47', '#406aff', '#ff8a3d'];

type Point = { x: number; y: number };

export type RallyFrame = {
  track: Point[];
  cars: CarView[];
  /** The car the camera follows, or null to show the whole road. */
  me: number | null;
  names?: string[];
  /** The named map, for its scenery. Plain grass without one. */
  map?: number;
  /** The item pads, and the Slicks and Barricades down. */
  pads?: PadView[];
  hazards?: HazardView[];
};

/** How each named map looks around its road: Harbour Loop, Switchback Hill, Old Town. */
type Theme = { ground: string; verge: string; kind: 'grass' | 'harbour' | 'hill' | 'town' };
const THEMES: Theme[] = [
  { ground: '#0e3550', verge: '#4a4f57', kind: 'harbour' },
  { ground: '#1f3318', verge: '#2c4220', kind: 'hill' },
  { ground: '#3a332c', verge: '#4d443a', kind: 'town' },
];
const GRASS: Theme = { ground: '#1d2a14', verge: '#2a3a1d', kind: 'grass' };

/** One thing beside the road: where, how big, which way it turns, and which look it takes. */
type Prop = { x: number; y: number; size: number; turn: number; pick: number };

/** A fixed number from 0 to 1 for a grid cell, so the scenery is the same on every screen. */
function noise(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function distanceToRoad(track: Point[], x: number, y: number): number {
  let best = Infinity;
  track.forEach((a, i) => {
    const b = track[(i + 1) % track.length]!;
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  });
  return best;
}

const sceneryCache = new Map<string, Prop[]>();

/** The props round a road: scattered on a grid, none on or near the barrier. Worked out once per road. */
function sceneryOf(track: Point[], theme: Theme): Prop[] {
  const key = `${theme.kind}:${track.map((p) => `${p.x},${p.y}`).join(';')}`;
  const cached = sceneryCache.get(key);
  if (cached) return cached;
  const unit = RALLY.SCALE;
  const step = (theme.kind === 'town' ? 95 : 62) * unit;
  const xs = track.map((p) => p.x);
  const ys = track.map((p) => p.y);
  const reach = 520 * unit;
  const props: Prop[] = [];
  for (let gx = Math.floor((Math.min(...xs) - reach) / step); gx <= Math.ceil((Math.max(...xs) + reach) / step); gx += 1) {
    for (let gy = Math.floor((Math.min(...ys) - reach) / step); gy <= Math.ceil((Math.max(...ys) + reach) / step); gy += 1) {
      if (noise(gx, gy, 1) > (theme.kind === 'town' ? 0.85 : 0.55)) continue;
      const jitter = theme.kind === 'town' ? 0.12 : 0.4;
      const x = (gx + (noise(gx, gy, 2) - 0.5) * jitter) * step;
      const y = (gy + (noise(gx, gy, 3) - 0.5) * jitter) * step;
      const size = (theme.kind === 'town' ? 30 + noise(gx, gy, 4) * 10 : 10 + noise(gx, gy, 4) * 14) * unit;
      const away = distanceToRoad(track, x, y);
      if (away < RALLY.WALL + size * 1.5 + 8 * unit) continue;
      props.push({ x, y, size, turn: noise(gx, gy, 5), pick: noise(gx, gy, 6) });
    }
  }
  sceneryCache.set(key, props);
  return props;
}

/** The ground under everything, and the props on it. Drawn in world units, before the road. */
function drawScenery(ctx: CanvasRenderingContext2D, track: Point[], theme: Theme) {
  const unit = RALLY.SCALE;
  if (theme.kind === 'grass' || theme.kind === 'hill') {
    // Rings, for grass stripes or the hill's contour lines.
    ctx.strokeStyle = theme.kind === 'hill' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.025)';
    ctx.lineWidth = (theme.kind === 'hill' ? 6 : 40) * unit;
    for (let r = 100; r < 1400; r += theme.kind === 'hill' ? 70 : 160) {
      ctx.beginPath();
      ctx.arc(0, 0, r * unit, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (theme.kind === 'harbour') {
    // Quays: a wide concrete band along the road, with the sea all round.
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 3 * unit;
    for (let y = -1400; y < 1400; y += 46) {
      ctx.beginPath();
      for (let x = -1400; x <= 1400; x += 40) ctx.lineTo(x * unit, (y + Math.sin(x / 60 + y) * 6) * unit);
      ctx.stroke();
    }
    loop(ctx, track);
    ctx.strokeStyle = '#2f343b';
    ctx.lineWidth = 2 * RALLY.WALL + 150 * unit;
    ctx.stroke();
    ctx.strokeStyle = '#e1bf47';
    ctx.setLineDash([10 * unit, 10 * unit]);
    ctx.lineWidth = 2 * unit;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (theme.kind === 'town') {
    // Paving stones.
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2 * unit;
    for (let v = -1400; v <= 1400; v += 34) {
      ctx.beginPath();
      ctx.moveTo(v * unit, -1400 * unit);
      ctx.lineTo(v * unit, 1400 * unit);
      ctx.moveTo(-1400 * unit, v * unit);
      ctx.lineTo(1400 * unit, v * unit);
      ctx.stroke();
    }
  }

  for (const prop of sceneryOf(track, theme)) {
    ctx.save();
    ctx.translate(prop.x, prop.y);
    if (theme.kind === 'harbour') drawHarbourProp(ctx, track, prop);
    else if (theme.kind === 'town') drawBuilding(ctx, prop);
    else drawTree(ctx, prop, theme.kind === 'hill');
    ctx.restore();
  }
}

function drawTree(ctx: CanvasRenderingContext2D, prop: Prop, hill: boolean) {
  const r = prop.size;
  if (hill && prop.pick < 0.22) {
    // A rock.
    ctx.rotate(prop.turn * Math.PI);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(r * 0.2, r * 0.25, r * 0.9, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7d8079';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.9, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9a9d95';
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, -r * 0.15, r * 0.45, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // A tree from above: shadow, crown, and a lighter top where the sun hits.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(r * 0.3, r * 0.35, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hill ? (prop.pick < 0.6 ? '#173d1c' : '#21502a') : '#2a4a1c';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hill ? '#2f6b34' : '#3f6b29';
  ctx.beginPath();
  ctx.arc(-r * 0.25, -r * 0.25, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function drawBuilding(ctx: CanvasRenderingContext2D, prop: Prop) {
  const s = prop.size;
  const [w, h] = prop.turn < 0.5 ? [s * 1.6, s * 1.1] : [s * 1.1, s * 1.6];
  const roofs = ['#9c4a2f', '#7a5a3a', '#b0633d', '#6d6a64'];
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(-w / 2 + s * 0.15, -h / 2 + s * 0.15, w, h);
  ctx.fillStyle = roofs[Math.floor(prop.pick * roofs.length)]!;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  // The ridge, and the darker half of the roof away from the sun.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  if (w > h) ctx.fillRect(-w / 2, 0, w, h / 2);
  else ctx.fillRect(0, -h / 2, w / 2, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = RALLY.SCALE * 1.5;
  ctx.beginPath();
  if (w > h) {
    ctx.moveTo(-w / 2 + s * 0.2, 0);
    ctx.lineTo(w / 2 - s * 0.2, 0);
  } else {
    ctx.moveTo(0, -h / 2 + s * 0.2);
    ctx.lineTo(0, h / 2 - s * 0.2);
  }
  ctx.stroke();
}

function drawHarbourProp(ctx: CanvasRenderingContext2D, track: Point[], prop: Prop) {
  const s = prop.size;
  const onQuay = distanceToRoad(track, prop.x, prop.y) < RALLY.WALL + 75 * RALLY.SCALE;
  if (onQuay) {
    // A shipping container on the quay.
    const colors = ['#c0392b', '#2e86de', '#e1bf47', '#27ae60'];
    ctx.rotate(prop.turn < 0.5 ? 0 : Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-s + s * 0.15, -s * 0.45 + s * 0.15, s * 2, s * 0.9);
    ctx.fillStyle = colors[Math.floor(prop.pick * colors.length)]!;
    ctx.fillRect(-s, -s * 0.45, s * 2, s * 0.9);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = RALLY.SCALE;
    for (let x = -s + s * 0.25; x < s; x += s * 0.25) {
      ctx.beginPath();
      ctx.moveTo(x, -s * 0.45);
      ctx.lineTo(x, s * 0.45);
      ctx.stroke();
    }
    return;
  }
  if (prop.pick > 0.35) return;
  // A small boat on the water, with its wake.
  ctx.rotate(prop.turn * Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = RALLY.SCALE * 2;
  ctx.beginPath();
  ctx.moveTo(-s * 1.1, -s * 0.5);
  ctx.lineTo(-s * 2.6, -s * 0.9);
  ctx.moveTo(-s * 1.1, s * 0.5);
  ctx.lineTo(-s * 2.6, s * 0.9);
  ctx.stroke();
  ctx.fillStyle = '#f2efe6';
  ctx.beginPath();
  ctx.moveTo(-s, -s * 0.45);
  ctx.lineTo(s * 0.6, -s * 0.45);
  ctx.lineTo(s * 1.2, 0);
  ctx.lineTo(s * 0.6, s * 0.45);
  ctx.lineTo(-s, s * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2e86de';
  ctx.fillRect(-s * 0.5, -s * 0.25, s * 0.7, s * 0.5);
}

/** How many position units fit across the shorter side of the screen when following a car. */
const VIEW_UNITS = 640 * RALLY.SCALE;

function loop(ctx: CanvasRenderingContext2D, track: Point[]) {
  ctx.beginPath();
  track.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.closePath();
}

/** Draws one frame of a rally, top down, on a canvas sized in device pixels. */
export function drawRally(ctx: CanvasRenderingContext2D, frame: RallyFrame) {
  const { width, height } = ctx.canvas;
  const { track, cars, me } = frame;
  const theme = (frame.map != null && THEMES[frame.map]) || GRASS;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, width, height);
  if (track.length === 0) return;

  // Camera: behind the followed car and turning with it, so its nose always points up; or the whole road.
  const xs = track.map((p) => p.x);
  const ys = track.map((p) => p.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 2 * RALLY.WALL;
  const followed = me != null ? cars[me] : undefined;
  const scale = followed ? Math.min(width, height) / VIEW_UNITS : Math.min(width, height) / span;
  const cx = followed ? followed.x : (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = followed ? followed.y : (Math.max(...ys) + Math.min(...ys)) / 2;
  if (followed) {
    ctx.translate(width / 2, height * 0.64);
    ctx.rotate(-Math.PI / 2 - followed.angle);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  } else {
    ctx.setTransform(scale, 0, 0, scale, width / 2 - cx * scale, height / 2 - cy * scale);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawScenery(ctx, track, theme);

  // Barrier, verge, road, then the middle line.
  loop(ctx, track);
  ctx.strokeStyle = '#ff5a5a';
  ctx.lineWidth = 2 * RALLY.WALL + 6 * RALLY.SCALE;
  ctx.stroke();
  ctx.strokeStyle = theme.verge;
  ctx.lineWidth = 2 * RALLY.WALL;
  ctx.stroke();
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 2 * RALLY.HALF_WIDTH + 4 * RALLY.SCALE;
  ctx.stroke();
  ctx.strokeStyle = '#2b2b2b';
  ctx.lineWidth = 2 * RALLY.HALF_WIDTH;
  ctx.stroke();
  ctx.setLineDash([18 * RALLY.SCALE, 22 * RALLY.SCALE]);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2 * RALLY.SCALE;
  ctx.stroke();
  ctx.setLineDash([]);

  // The start line: a checkered band across the road at point 0.
  const [a, b] = [track[0]!, track[1]!];
  const along = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(along);
  const cell = RALLY.HALF_WIDTH / 5;
  for (let row = 0; row < 2; row += 1) {
    for (let col = -5; col < 5; col += 1) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#ffffff' : '#111111';
      ctx.fillRect(row * cell - cell, col * cell, cell, cell);
    }
  }
  ctx.restore();

  // Pads in their item's colour, dim while empty; Slicks as dark puddles, Barricades as blocks.
  for (const pad of frame.pads ?? []) {
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, 12 * RALLY.SCALE, 0, Math.PI * 2);
    ctx.globalAlpha = pad.empty ? 0.2 : 0.9;
    ctx.fillStyle = ITEMS[pad.item]?.color ?? '#ffffff';
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const hazard of frame.hazards ?? []) {
    ctx.fillStyle = hazard.kind === SLICK_ITEM ? 'rgba(40,20,70,0.85)' : '#ffb020';
    if (hazard.kind === SLICK_ITEM) {
      ctx.beginPath();
      ctx.arc(hazard.x, hazard.y, 16 * RALLY.SCALE, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(hazard.x - 10 * RALLY.SCALE, hazard.y - 10 * RALLY.SCALE, 20 * RALLY.SCALE, 20 * RALLY.SCALE);
    }
  }

  // Cars: the followed one on top.
  const order = cars.map((_, i) => i).sort((x, y) => (x === me ? 1 : y === me ? -1 : 0));
  for (const i of order) drawCar(ctx, cars[i]!, CAR_COLORS[i % CAR_COLORS.length]!, i === me);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (followed) drawMap(ctx, frame, Math.min(width, height) * 0.28);
}

function drawCar(ctx: CanvasRenderingContext2D, car: CarView, color: string, mine: boolean) {
  const length = 2.4 * RALLY.CAR_RADIUS;
  const width = 1.4 * RALLY.CAR_RADIUS;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.globalAlpha = car.finished != null ? 0.45 : 1;
  if (car.boosting) {
    ctx.fillStyle = '#ff8a1f';
    ctx.beginPath();
    ctx.moveTo(-length / 2, -width / 3);
    ctx.lineTo(-length / 2 - length * (0.6 + Math.random() * 0.3), 0);
    ctx.lineTo(-length / 2, width / 3);
    ctx.fill();
  }
  // Shadow, body, cockpit.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-length / 2 + RALLY.SCALE * 2, -width / 2 + RALLY.SCALE * 2, length, width);
  ctx.fillStyle = color;
  roundRect(ctx, -length / 2, -width / 2, length, width, width / 3);
  ctx.fill();
  ctx.fillStyle = '#111111';
  roundRect(ctx, -length * 0.05, -width * 0.32, length * 0.28, width * 0.64, width / 6);
  ctx.fill();
  if (mine) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 * RALLY.SCALE;
    roundRect(ctx, -length / 2, -width / 2, length, width, width / 3);
    ctx.stroke();
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The whole road, small, in the top right corner, with every car on it. */
function drawMap(ctx: CanvasRenderingContext2D, frame: RallyFrame, size: number) {
  const { width } = ctx.canvas;
  const { track, cars } = frame;
  const xs = track.map((p) => p.x);
  const ys = track.map((p) => p.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.15;
  const scale = size / span;
  const ox = width - size / 2 - size * 0.08;
  const oy = size / 2 + size * 0.08;
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  ctx.beginPath();
  ctx.arc(ox, oy, size * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.translate(-midX, -midY);
  loop(ctx, track);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 3 / scale;
  ctx.lineJoin = 'round';
  ctx.stroke();
  cars.forEach((car, i) => {
    ctx.fillStyle = CAR_COLORS[i % CAR_COLORS.length]!;
    ctx.beginPath();
    ctx.arc(car.x, car.y, 5 / scale, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}
