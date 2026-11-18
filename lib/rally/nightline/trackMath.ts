import type { TrackData, TrackPoint } from './types';

export interface SampledTrackPoint {
  x: number;
  y: number;
  elevation: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  dist: number;
  t: number;
  /** On a sharp centre line, a sample in a corner's fan: which way the corner turns (+1 left, -1 right). */
  turn?: number;
  /** On a sharp centre line, the stretch this sample lies on: from that point to the next. */
  seg?: number;
}

export interface TrackProjection {
  s: number;
  t: number;
  distance: number;
  signedOffset: number;
  point: SampledTrackPoint;
  segmentIndex: number;
}

export interface SampledTrack {
  samples: SampledTrackPoint[];
  totalLength: number;
  roadWidth: number;
  wallDistance: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** The centre line as given, when it is drawn with sharp corners: offsets are kept this far from all of it. */
  outline?: { x: number; y: number }[];
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number, tension = 0.5): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const m1 = tension * (p2 - p0);
  const m2 = tension * (p3 - p1);
  return (
    (2 * t3 - 3 * t2 + 1) * p1 +
    (t3 - 2 * t2 + t) * m1 +
    (-2 * t3 + 3 * t2) * p2 +
    (t3 - t2) * m2
  );
}

/**
 * Resamples a closed-loop list of TrackPoints into an evenly-spaced polyline
 * with smooth tangents, normals, elevation, and arc-length distance.
 */
export function buildSampledTrack(track: TrackData, stepMeters = 2.0): SampledTrack {
  const pts: TrackPoint[] = track.points;
  if (pts.length < 3) {
    throw new Error('Track must have at least 3 centre-line points');
  }
  if (track.sharpCorners) return buildSharpTrack(track, stepMeters);

  const n = pts.length;
  const dense: { x: number; y: number; elevation: number }[] = [];
  const subPerSeg = 24;

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    for (let s = 0; s < subPerSeg; s++) {
      const u = s / subPerSeg;
      dense.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, u, 0.45),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, u, 0.45),
        elevation: catmullRom(
          p0.elevation ?? 0,
          p1.elevation ?? 0,
          p2.elevation ?? 0,
          p3.elevation ?? 0,
          u,
          0.45,
        ),
      });
    }
  }

  // Compute cumulative arc length of dense loop
  const cumLen: number[] = [0];
  let totalDenseLen = 0;
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    totalDenseLen += Math.hypot(b.x - a.x, b.y - a.y);
    cumLen.push(totalDenseLen);
  }

  const sampleCount = Math.max(48, Math.round(totalDenseLen / Math.max(0.5, stepMeters)));
  const rawSamples: { x: number; y: number; elevation: number; dist: number }[] = [];
  let segPtr = 0;

  for (let k = 0; k < sampleCount; k++) {
    const targetDist = (k / sampleCount) * totalDenseLen;
    while (segPtr < dense.length - 1 && cumLen[segPtr + 1] < targetDist) {
      segPtr++;
    }
    const d0 = cumLen[segPtr];
    const d1 = cumLen[segPtr + 1];
    const frac = d1 > d0 ? (targetDist - d0) / (d1 - d0) : 0;
    const a = dense[segPtr];
    const b = dense[(segPtr + 1) % dense.length];
    rawSamples.push({
      x: a.x + (b.x - a.x) * frac,
      y: a.y + (b.y - a.y) * frac,
      elevation: a.elevation + (b.elevation - a.elevation) * frac,
      dist: targetDist,
    });
  }

  const samples: SampledTrackPoint[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < rawSamples.length; i++) {
    const prev = rawSamples[(i - 1 + rawSamples.length) % rawSamples.length];
    const curr = rawSamples[i];
    const next = rawSamples[(i + 1) % rawSamples.length];

    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    // Right-hand normal in XZ plane: (tx, ty) -> (-ty, tx)
    const nx = -dy;
    const ny = dx;

    minX = Math.min(minX, curr.x);
    maxX = Math.max(maxX, curr.x);
    minY = Math.min(minY, curr.y);
    maxY = Math.max(maxY, curr.y);

    samples.push({
      x: curr.x,
      y: curr.y,
      elevation: curr.elevation,
      tx: dx,
      ty: dy,
      nx,
      ny,
      dist: curr.dist,
      t: curr.dist / totalDenseLen,
    });
  }

  return {
    samples,
    totalLength: totalDenseLen,
    roadWidth: track.roadWidth,
    wallDistance: Math.max(track.wallDistance, track.roadWidth * 0.5 + 0.5),
    bounds: { minX, maxX, minY, maxY },
  };
}

/**
 * Evaluates a point along the closed loop at normalized parameter t in [0, 1).
 */
export function sampleTrackAtT(sampled: SampledTrack, tNorm: number): SampledTrackPoint {
  const t = ((tNorm % 1) + 1) % 1;
  const fIdx = t * sampled.samples.length;
  const i0 = Math.floor(fIdx) % sampled.samples.length;
  const i1 = (i0 + 1) % sampled.samples.length;
  const frac = fIdx - Math.floor(fIdx);
  const a = sampled.samples[i0];
  const b = sampled.samples[i1];

  let tx = a.tx + (b.tx - a.tx) * frac;
  let ty = a.ty + (b.ty - a.ty) * frac;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;

  return {
    x: a.x + (b.x - a.x) * frac,
    y: a.y + (b.y - a.y) * frac,
    elevation: a.elevation + (b.elevation - a.elevation) * frac,
    tx,
    ty,
    nx: -ty,
    ny: tx,
    dist: t * sampled.totalLength,
    t,
  };
}

/**
 * Projects a world (x, y) position onto the closest segment of the closed track loop.
 */
export function projectPointOntoTrack(
  sampled: SampledTrack,
  x: number,
  y: number,
  hintSegment?: number,
): TrackProjection {
  const samples = sampled.samples;
  const n = samples.length;

  let bestSeg = 0;
  let bestDistSq = Infinity;
  let bestProjT = 0;

  const evalSegment = (i: number) => {
    const a = samples[i];
    const b = samples[(i + 1) % n];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abLenSq = abx * abx + aby * aby;
    let u = 0;
    if (abLenSq > 1e-6) {
      u = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / abLenSq));
    }
    const px = a.x + abx * u;
    const py = a.y + aby * u;
    const dx = x - px;
    const dy = y - py;
    const dSq = dx * dx + dy * dy;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestSeg = i;
      bestProjT = u;
    }
  };

  if (hintSegment !== undefined && hintSegment >= 0 && hintSegment < n) {
    const window = 14;
    for (let offset = -window; offset <= window; offset++) {
      evalSegment((hintSegment + offset + n) % n);
    }
    // Fallback to global search if far away
    if (bestDistSq > sampled.wallDistance * sampled.wallDistance * 4) {
      for (let i = 0; i < n; i++) evalSegment(i);
    }
  } else {
    for (let i = 0; i < n; i++) evalSegment(i);
  }

  const a = samples[bestSeg];
  const b = samples[(bestSeg + 1) % n];
  const px = a.x + (b.x - a.x) * bestProjT;
  const py = a.y + (b.y - a.y) * bestProjT;
  const elev = a.elevation + (b.elevation - a.elevation) * bestProjT;

  let tx = a.tx + (b.tx - a.tx) * bestProjT;
  let ty = a.ty + (b.ty - a.ty) * bestProjT;
  const tLen = Math.hypot(tx, ty) || 1;
  tx /= tLen;
  ty /= tLen;
  const nx = -ty;
  const ny = tx;

  const dx = x - px;
  const dy = y - py;
  const distance = Math.sqrt(bestDistSq);
  const signedOffset = dx * nx + dy * ny;

  const segDist = (bestSeg + bestProjT) / n;
  const s = segDist * sampled.totalLength;

  return {
    s,
    t: segDist,
    distance,
    signedOffset,
    segmentIndex: bestSeg,
    point: {
      x: px,
      y: py,
      elevation: elev,
      tx,
      ty,
      nx,
      ny,
      dist: s,
      t: segDist,
    },
  };
}

/**
 * Whether a whole footprint stands clear of the walls, not just its middle: the rectangle `minX..maxX`
 * by `minZ..maxZ` in the prop's own frame, turned by `rotY` as three.js turns it, checked round its edge.
 */
export function isFootprintSafe(
  sampled: SampledTrack,
  x: number,
  y: number,
  rotY: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  clearanceRadius: number,
): boolean {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  for (let a = 0; a <= 4; a++) {
    for (let b = 0; b <= 4; b++) {
      if (a > 0 && a < 4 && b > 0 && b < 4) continue;
      const u = minX + ((maxX - minX) * a) / 4;
      const v = minZ + ((maxZ - minZ) * b) / 4;
      if (!isScenerySpotSafe(sampled, x + u * c + v * s, y - u * s + v * c, clearanceRadius)) return false;
    }
  }
  return true;
}

/**
 * How far along the line from (fromX, fromY) to (toX, toY), from 0 to 1, stays within `limit` of the
 * centre line. Scenery stands outside the walls, so a chase camera kept inside them never ends up in a
 * crane or a building, or with one between it and the car. `fromX, fromY` should be on the road.
 */
export function insideWallsFraction(
  sampled: SampledTrack,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  limit: number,
): number {
  const out = (t: number) => projectPointOntoTrack(sampled, fromX + (toX - fromX) * t, fromY + (toY - fromY) * t).distance > limit;
  const STEPS = 8;
  for (let i = 1; i <= STEPS; i++) {
    if (!out(i / STEPS)) continue;
    // Narrow down where the line crosses out between the last point inside and this one.
    let lo = (i - 1) / STEPS;
    let hi = i / STEPS;
    for (let k = 0; k < 5; k++) {
      const mid = (lo + hi) / 2;
      if (out(mid)) hi = mid;
      else lo = mid;
    }
    return lo;
  }
  return 1;
}

/**
 * Returns true if a circle at (x, y) with given clearance radius is strictly
 * outside the entire closed-loop track wall corridor (never touching or crossing the road).
 */
export function isScenerySpotSafe(
  sampled: SampledTrack,
  x: number,
  y: number,
  clearanceRadius = 1.5,
): boolean {
  const minAllowed = sampled.wallDistance + clearanceRadius;
  const minAllowedSq = minAllowed * minAllowed;
  const samples = sampled.samples;
  const n = samples.length;

  for (let i = 0; i < n; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % n];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    let u = 0;
    if (lenSq > 1e-6) {
      u = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / lenSq));
    }
    const dx = x - (a.x + abx * u);
    const dy = y - (a.y + aby * u);
    if (dx * dx + dy * dy < minAllowedSq) {
      return false;
    }
  }
  return true;
}

/**
 * The centre line exactly as given: straight lines between the points, and at each corner a fan of
 * samples on the corner point that turns the normal round, so the outside of a corner is an arc
 * about it, as a barrier at a fixed distance from the line is.
 */
function buildSharpTrack(track: TrackData, stepMeters: number): SampledTrack {
  const pts = track.points;
  const n = pts.length;
  const lengths = pts.map((p, i) => Math.hypot(pts[(i + 1) % n].x - p.x, pts[(i + 1) % n].y - p.y));
  const totalLength = lengths.reduce((sum, l) => sum + l, 0);
  const heading = (i: number) => Math.atan2(pts[(i + 1) % n].y - pts[i].y, pts[(i + 1) % n].x - pts[i].x);
  const samples: SampledTrackPoint[] = [];
  const push = (x: number, y: number, elevation: number, angle: number, dist: number, seg: number, turn?: number) =>
    samples.push({ x, y, elevation, tx: Math.cos(angle), ty: Math.sin(angle), nx: -Math.sin(angle), ny: Math.cos(angle), dist, t: dist / totalLength, turn, seg });

  let dist = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const from = heading((i - 1 + n) % n);
    let turn = heading(i) - from;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const fan = Math.ceil(Math.abs(turn) / (Math.PI / 24));
    for (let k = 0; k < fan; k++) push(a.x, a.y, a.elevation ?? 0, from + (turn * k) / fan, dist, k > 0 ? i : (i - 1 + n) % n, k > 0 ? Math.sign(turn) : undefined);
    const steps = Math.max(1, Math.round(lengths[i] / Math.max(0.5, stepMeters)));
    for (let j = 0; j < steps; j++) {
      const u = j / steps;
      const elevation = (a.elevation ?? 0) + ((b.elevation ?? 0) - (a.elevation ?? 0)) * u;
      push(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, elevation, heading(i), dist + lengths[i] * u, i);
    }
    dist += lengths[i];
  }

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    samples,
    totalLength,
    roadWidth: track.roadWidth,
    wallDistance: Math.max(track.wallDistance, track.roadWidth * 0.5 + 0.5),
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
    outline: pts.map((p) => ({ x: p.x, y: p.y })),
  };
}

/** The nearest point of a closed centre line to (x, y), and how far it is; or of just stretch `only`. */
function nearestOnOutline(outline: { x: number; y: number }[], x: number, y: number, only?: number) {
  let best = { x: outline[0].x, y: outline[0].y, d: Infinity };
  for (let i = only ?? 0; i < (only != null ? only + 1 : outline.length); i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    const u = lenSq > 1e-9 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / lenSq)) : 0;
    const px = a.x + abx * u;
    const py = a.y + aby * u;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { x: px, y: py, d };
  }
  return best;
}

/**
 * The point `offset` metres to the side of a sample. On a sharp centre line, a point on the inside of a
 * corner would land nearer the next stretch than `offset` and fold the edge back across the road, so
 * it is pushed out until it is that far from all of the line: into the corner's inside point. Where
 * that can't be done (two stretches close together), it is null, and the edge skips that sample.
 */
export function offsetPoint(sampled: SampledTrack, s: SampledTrackPoint, offset: number): { x: number; y: number } | null {
  let x = s.x + s.nx * offset;
  let y = s.y + s.ny * offset;
  const reach = Math.abs(offset);
  const outline = sampled.outline;
  if (!outline || reach < 0.01 || reach > sampled.wallDistance + 4) return { x, y };
  // The fan on the inside of a corner: the straight samples either side already meet at its inside point.
  if (s.turn != null && Math.sign(offset) === s.turn) return null;
  for (let pass = 0; pass < 48; pass++) {
    const near = nearestOnOutline(outline, x, y);
    if (near.d >= reach - 0.01) break;
    if (near.d < 1e-6) break;
    x = near.x + ((x - near.x) * reach) / near.d;
    y = near.y + ((y - near.y) * reach) / near.d;
  }
  // A point pushed clear of the whole line but away from its own stretch has crossed the road: no edge here.
  const ownStretch = s.seg == null || nearestOnOutline(outline, x, y, s.seg).d <= reach + 0.05;
  return ownStretch && nearestOnOutline(outline, x, y).d >= reach - 0.05 ? { x, y } : null;
}

/**
 * Every sample's point `offset` to the side, or null where no edge that far out can be: there the two
 * sides of a tight corner overlap, and an edge or wall drawn there would cross the road.
 */
export function offsetEdge(sampled: SampledTrack, offset: number): ({ x: number; y: number } | null)[] {
  return sampled.samples.map((s) => offsetPoint(sampled, s, offset));
}
