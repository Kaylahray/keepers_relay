import * as THREE from 'three';
import { RALLY } from '@/lib/rally/rules';

/**
 * The 3D world for Crowns: each named map's road, barriers, scenery and lights, and the cars.
 * Only drawing: the race itself is the same flat race the rules play, so a car's place on the road
 * here is exactly where the rules have it. The road is built from the same middle line the rules
 * use, with the same widths, so the barrier you see is the barrier you hit.
 */

/** Metres per position unit: a car (2 × `CAR_RADIUS` long) comes out about 5.5 m. */
export const METRES = 1 / (4 * RALLY.SCALE);
const HALF_WIDTH = (55 * RALLY.SCALE) * METRES;
const WALL = RALLY.WALL * METRES;
/** The barrier face: the rules stop a car's middle at WALL, so the barrier sits half a car further out and the car's side touches it instead of going in. */
const SIDE = WALL + 1.3;
/** Arc points round the outside of each corner. */
const ARC = 8;

type Point = { x: number; y: number };
type Flat = { x: number; z: number };

/** How each map looks: sky, ground, road, barrier, lights and the kind of scenery round the road. */
export type Theme = {
  kind: 'harbour' | 'hill' | 'town' | 'plain';
  /** The sky straight up, at the horizon, and the sun's glow if it's in the sky. */
  sky: number;
  horizon: number;
  sun: number | null;
  /** The haze colour things fade into with distance. */
  haze: number;
  /** How thick the haze is: higher hides the distance sooner. */
  fog: number;
  ground: number;
  /** The road's own colour, [r, g, b]: each map's differs, and none matches the land beside it. */
  road: [number, number, number];
  /** How the road is painted: wet asphalt, a yellow centre line, cobbles, or the old dashed lanes. */
  surface: 'wet' | 'yellow' | 'cobble' | 'dashed';
  /** The road's shine: low is wet and glossy. */
  rough: number;
  apron: number;
  verge: number;
  kerbs: boolean;
  wall: number;
  /** The barrier's height and depth, in metres: a guardrail, a quay wall, a kerb stone. */
  rail: [number, number];
  /** The glow along the barrier tops, if any. */
  glow: number | null;
  lamp: number;
  hemi: [number, number, number];
  key: [number, number];
};

const THEMES: Record<Theme['kind'], Theme> = {
  // Night on the quay: wet black asphalt, the water beside it, stacked boxes, neon cranes, the city behind.
  harbour: {
    kind: 'harbour', sky: 0x03060c, horizon: 0x16202f, sun: null, haze: 0x0c121c, fog: 0.004, ground: 0x040a12,
    road: [20, 23, 29], surface: 'wet', rough: 0.24, apron: 0x13161c, verge: 0x20252d, kerbs: false,
    wall: 0x2c333d, rail: [1.1, 0.7], glow: 0x9cc4ff, lamp: 0xcfe4ff, hemi: [0x4a6aa0, 0x05070c, 0.6], key: [0x9fc0ff, 0.55],
  },
  // Dusk up the hill: a purple and orange sky, dark pines, rocks, steel guardrails, warm lamps.
  hill: {
    kind: 'hill', sky: 0x231d48, horizon: 0xc8768a, sun: 0xffa060, haze: 0x4a3558, fog: 0.0038, ground: 0x15221a,
    road: [44, 44, 52], surface: 'yellow', rough: 0.72, apron: 0x1f2e20, verge: 0x29361f, kerbs: false,
    wall: 0xa4adb8, rail: [0.95, 0.3], glow: null, lamp: 0xffb45a, hemi: [0xc49ad8, 0x12180f, 0.8], key: [0xffb08a, 1.05],
  },
  // Old Town at night: wet cobbles, tall stone houses on the street, lanterns, mist.
  town: {
    kind: 'town', sky: 0x090b12, horizon: 0x2b2a33, sun: null, haze: 0x24232b, fog: 0.0105, ground: 0x15120f,
    road: [66, 58, 52], surface: 'cobble', rough: 0.34, apron: 0x2a2521, verge: 0x37302a, kerbs: false,
    wall: 0x544b43, rail: [0.35, 1.3], glow: null, lamp: 0xffb052, hemi: [0x6a6488, 0x0c0806, 0.5], key: [0xffd2a0, 0.35],
  },
  plain: {
    kind: 'plain', sky: 0x0b1220, horizon: 0x0b1220, sun: null, haze: 0x0b1220, fog: 0.004, ground: 0x15220f,
    road: [40, 44, 52], surface: 'dashed', rough: 0.78, apron: 0x2a4a1d, verge: 0x5a4a30, kerbs: true,
    wall: 0x2b3240, rail: [1.3, 0.8], glow: 0x99ee2d, lamp: 0xe6f6ff, hemi: [0x8ab4ff, 0x0b0f08, 0.8], key: [0xffffff, 1.3],
  },
};

export function themeOf(map?: number): Theme {
  return [THEMES.harbour, THEMES.hill, THEMES.town][map ?? -1] ?? THEMES.plain;
}

/** A fixed number from 0 to 1 for a pair of whole numbers, so the scenery is the same on every screen. */
function noise(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** The road's middle line in metres, on the ground plane (x across, z down the page as in 2D). */
export function flatten(track: Point[]): Flat[] {
  return track.map((p) => ({ x: p.x * METRES, z: p.y * METRES }));
}

function unit(dx: number, dz: number): Flat {
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

/** Right of travel: the side a bigger heading turns toward. */
function right(d: Flat): Flat {
  return { x: -d.z, z: d.x };
}

/**
 * The line `lat` metres to the right of the middle line (left if negative), `ARC + 1` points per
 * corner: round the outside of a corner it follows an arc, on the inside it meets at the mitre, as
 * the rules' "within this far of the line" makes it. Each point carries how far along the road it is.
 */
function edge(line: Flat[], lat: number): { x: number; z: number; s: number }[] {
  const n = line.length;
  const out: { x: number; z: number; s: number }[] = [];
  let s = 0;
  for (let i = 0; i < n; i += 1) {
    const v = line[i]!;
    const before = line[(i + n - 1) % n]!;
    const after = line[(i + 1) % n]!;
    const d0 = unit(v.x - before.x, v.z - before.z);
    const d1 = unit(after.x - v.x, after.z - v.z);
    const [n0, n1] = [right(d0), right(d1)];
    const turn = d0.x * d1.z - d0.z * d1.x;
    if (lat * turn <= 0) {
      // The outside of the corner (or straight on): an arc round the corner point.
      const a0 = Math.atan2(n0.z, n0.x);
      let delta = Math.atan2(n1.z, n1.x) - a0;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      for (let k = 0; k <= ARC; k += 1) {
        const a = a0 + (delta * k) / ARC;
        out.push({ x: v.x + Math.cos(a) * lat, z: v.z + Math.sin(a) * lat, s });
      }
    } else {
      const dot = n0.x * n1.x + n0.z * n1.z;
      const scale = lat / Math.max(0.25, 1 + dot);
      const point = { x: v.x + (n0.x + n1.x) * scale, z: v.z + (n0.z + n1.z) * scale, s };
      for (let k = 0; k <= ARC; k += 1) out.push(point);
    }
    s += Math.hypot(after.x - v.x, after.z - v.z);
  }
  // Close the loop.
  out.push({ ...out[0]!, s });
  return out;
}

/** A flat band between two side lines, `y` above the ground. `across` repeats the texture across it, `along` per metre. */
function band(line: Flat[], from: number, to: number, y: number, across = 1, along = 0.05): THREE.BufferGeometry {
  const [a, b] = [edge(line, from), edge(line, to)];
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  // Every triangle must face up, or it isn't drawn at all. Which way one winds depends on which way
  // round the road goes and, on a tight bend, on the inner edge folding over, so each is checked.
  const corners = a.flatMap((p, i) => [p, b[i]!]);
  const triangle = (i: number, j: number, k: number) => {
    const [p, q, r] = [corners[i]!, corners[j]!, corners[k]!];
    const up = (q.z - p.z) * (r.x - p.x) - (q.x - p.x) * (r.z - p.z) > 0;
    index.push(...(up ? [i, j, k] : [i, k, j]));
  };
  a.forEach((p, i) => {
    const q = b[i]!;
    positions.push(p.x, y, p.z, q.x, y, q.z);
    uvs.push(0, p.s * along, across, q.s * along);
    if (i < a.length - 1) {
      const k = i * 2;
      triangle(k, k + 2, k + 1);
      triangle(k + 1, k + 2, k + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** A barrier: its face toward the road `lat` metres out, `thick` deep and `height` tall. */
function barrier(line: Flat[], lat: number, thick: number, height: number): THREE.BufferGeometry {
  const sign = Math.sign(lat);
  const [inner, outer] = [edge(line, lat), edge(line, lat + sign * thick)];
  const positions: number[] = [];
  const index: number[] = [];
  inner.forEach((p, i) => {
    const q = outer[i]!;
    positions.push(p.x, -0.2, p.z, p.x, height, p.z, q.x, height, q.z, q.x, -0.2, q.z);
    if (i < inner.length - 1) {
      const k = i * 4;
      const m = k + 4;
      // The face to the road, the top, the back. Drawn from both sides, so the winding doesn't matter.
      index.push(k, k + 1, m, k + 1, m + 1, m, k + 1, k + 2, m + 1, k + 2, m + 2, m + 1, k + 2, k + 3, m + 2, k + 3, m + 3, m + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** The sky all round, for the scene's background: dark overhead, the haze colour at the horizon, the sunset's glow on a dusk map. */
export function skyTexture(theme: Theme): THREE.CanvasTexture {
  const texture = canvasTexture(1024, 512, (ctx) => {
    const fade = ctx.createLinearGradient(0, 0, 0, 512);
    fade.addColorStop(0, hex(theme.sky));
    fade.addColorStop(0.3, hex(theme.sky));
    fade.addColorStop(0.5, hex(theme.horizon));
    fade.addColorStop(1, hex(theme.horizon));
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 1024, 512);
    if (theme.sun != null) {
      // A low sun behind the ridges, a warm band along the horizon, and long streaks of cloud.
      const band = ctx.createLinearGradient(0, 170, 0, 260);
      band.addColorStop(0, 'rgba(255,140,90,0)');
      band.addColorStop(0.7, 'rgba(255,150,90,0.55)');
      band.addColorStop(1, 'rgba(255,190,120,0.75)');
      ctx.fillStyle = band;
      ctx.fillRect(0, 170, 1024, 90);
      const sun = ctx.createRadialGradient(300, 250, 4, 300, 250, 220);
      sun.addColorStop(0, 'rgba(255,230,170,1)');
      sun.addColorStop(0.15, hex(theme.sun));
      sun.addColorStop(1, 'rgba(255,120,80,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 26; i += 1) {
        const y = 60 + noise(i, 1, 51) * 170;
        const x = noise(i, 2, 51) * 1024;
        const w = 120 + noise(i, 3, 51) * 300;
        ctx.fillStyle = y > 160 ? `rgba(255,${120 + Math.floor(noise(i, 4, 51) * 60)},120,0.35)` : 'rgba(70,50,110,0.45)';
        ctx.beginPath();
        ctx.ellipse(x, y, w / 2, 4 + noise(i, 5, 51) * 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Night: low cloud lit from below by the city, and a few stars overhead.
      for (let i = 0; i < 40; i += 1) {
        ctx.fillStyle = `rgba(${theme.kind === 'town' ? '90,80,90' : '60,80,110'},${0.12 + noise(i, 6, 52) * 0.15})`;
        ctx.beginPath();
        ctx.ellipse(noise(i, 1, 52) * 1024, 150 + noise(i, 2, 52) * 100, 80 + noise(i, 3, 52) * 200, 10 + noise(i, 4, 52) * 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 90; i += 1) ctx.fillRect(noise(i, 1, 53) * 1024, noise(i, 2, 53) * 140, 1.5, 1.5);
    }
  });
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** The road's surface, painted for the map: wet asphalt with tyre marks, a yellow centre line, cobbles, or dashed lanes. */
function roadTexture(theme: Theme): THREE.CanvasTexture {
  const [r, g, b] = theme.road;
  if (theme.surface === 'cobble') {
    return canvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = '#1a1512';
      ctx.fillRect(0, 0, 256, 256);
      const [w, h] = [21, 16];
      for (let row = 0; row < 256 / h; row += 1) {
        const shift = (row % 2) * (w / 2);
        for (let col = -1; col < 256 / w + 1; col += 1) {
          const v = Math.floor(noise(col, row, 61) * 40) - 20;
          const warm = Math.floor(noise(col, row, 62) * 14);
          ctx.fillStyle = `rgb(${r + v + warm},${g + v + warm / 2},${b + v})`;
          ctx.beginPath();
          ctx.roundRect(col * w + shift + 1.5, row * h + 1.5, w - 3, h - 3, 5);
          ctx.fill();
          // A wet shine on the top of each stone.
          ctx.fillStyle = `rgba(255,220,170,${0.05 + noise(col, row, 63) * 0.1})`;
          ctx.fillRect(col * w + shift + 4, row * h + 3, w - 9, 3);
        }
      }
    });
  }
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i += 1) {
      const v = Math.floor(noise(i, 1, 7) * 24) - 12;
      ctx.fillStyle = `rgb(${r + v},${g + v},${b + v})`;
      ctx.fillRect(noise(i, 2, 7) * 256, noise(i, 3, 7) * 256, 2, 2);
    }
    if (theme.surface === 'wet') {
      // Tyre lines down the road, dark and shiny, where the cars keep to the racing line.
      for (let i = 0; i < 70; i += 1) {
        const x = 20 + noise(i, 4, 7) * 216;
        ctx.fillStyle = noise(i, 5, 7) > 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(170,190,230,0.06)';
        ctx.fillRect(x, 0, 1 + noise(i, 6, 7) * 3, 256);
      }
    }
    const shade = ctx.createLinearGradient(0, 0, 256, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.3)');
    shade.addColorStop(0.5, 'rgba(0,0,0,0.05)');
    shade.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = theme.surface === 'wet' ? 'rgba(220,228,240,0.8)' : '#e8edf3';
    ctx.fillRect(7, 0, 4, 256);
    ctx.fillRect(245, 0, 4, 256);
    if (theme.surface === 'yellow') {
      ctx.fillStyle = '#e2ae3a';
      ctx.fillRect(122, 0, 4, 256);
      ctx.fillRect(131, 0, 4, 256);
    } else if (theme.surface === 'dashed' && theme.glow != null) {
      ctx.fillStyle = hex(theme.glow);
      for (let y = 8; y < 256; y += 64) {
        ctx.fillRect(84, y, 4, 34);
        ctx.fillRect(168, y, 4, 34);
      }
    }
  });
}

/** Lit windows on a dark wall, for the city's towers. */
function windows(): THREE.CanvasTexture {
  return canvasTexture(128, 256, (ctx) => {
    ctx.fillStyle = '#070d18';
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 6; y < 250; y += 12) {
      for (let x = 6; x < 122; x += 12) {
        const lit = noise(x, y, 4);
        if (lit < 0.5) continue;
        ctx.fillStyle = lit > 0.92 ? '#ff6ad5' : lit > 0.85 ? '#6ae6ff' : lit > 0.68 ? '#fde3a0' : '#9fc6f0';
        ctx.fillRect(x, y, 6, 6);
      }
    }
  });
}

/**
 * An old town house front: stone and timber with tall windows, some lit. `glow` paints only the lit
 * windows on black, for the material's light of its own.
 */
function facade(glow: boolean): THREE.CanvasTexture {
  return canvasTexture(256, 512, (ctx) => {
    ctx.fillStyle = glow ? '#000000' : '#b8aa9a';
    ctx.fillRect(0, 0, 256, 512);
    if (!glow) {
      // Stone courses on the ground floor, plaster and timber above.
      for (let y = 400; y < 512; y += 14) {
        for (let x = -20 + ((y / 14) % 2) * 18; x < 256; x += 36) {
          const v = Math.floor(noise(x, y, 71) * 40);
          ctx.fillStyle = `rgb(${120 + v},${108 + v},${96 + v})`;
          ctx.fillRect(x + 1, y + 1, 34, 12);
        }
      }
      ctx.fillStyle = '#3a2a20';
      for (const y of [140, 270, 398]) ctx.fillRect(0, y, 256, 8);
      for (const x of [0, 84, 168, 248]) ctx.fillRect(x, 0, 8, 400);
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#3a2a20';
      for (const y0 of [148, 278]) {
        ctx.beginPath();
        ctx.moveTo(8, y0 + 120);
        ctx.lineTo(42, y0);
        ctx.moveTo(250, y0 + 120);
        ctx.lineTo(214, y0);
        ctx.stroke();
      }
    }
    // Two rows of three tall windows, and a lit shop window or a dark door at street level.
    for (const [row, y] of [[0, 30], [1, 160], [2, 290]] as const) {
      for (let col = 0; col < 3; col += 1) {
        const x = 26 + col * 84;
        const lit = noise(col, row, 72) > 0.42;
        if (glow) {
          if (!lit) continue;
          const warm = ctx.createLinearGradient(0, y, 0, y + 90);
          warm.addColorStop(0, '#ffcf7a');
          warm.addColorStop(1, '#e8862e');
          ctx.fillStyle = warm;
        } else {
          ctx.fillStyle = lit ? '#f0b060' : '#151519';
        }
        ctx.fillRect(x, y, 44, 90);
        if (!glow) {
          ctx.fillStyle = '#2a1e18';
          ctx.fillRect(x + 20, y, 4, 90);
          ctx.fillRect(x, y + 40, 44, 4);
        }
      }
    }
    const shop = noise(3, 3, 72) > 0.4;
    if (glow ? shop : true) {
      ctx.fillStyle = glow ? '#ffb85c' : shop ? '#e0a050' : '#1a1512';
      ctx.beginPath();
      ctx.roundRect(70, 420, 116, 92, [50, 50, 0, 0]);
      ctx.fill();
    }
  });
}

/** Black and white checks with the race's name across the middle, for the finish arch and line. */
function finishBanner(): THREE.CanvasTexture {
  const texture = canvasTexture(512, 128, (ctx) => {
    for (let y = 0; y < 128; y += 32) {
      for (let x = 0; x < 512; x += 32) {
        ctx.fillStyle = (x / 32 + y / 32) % 2 === 0 ? '#0a0b0f' : '#f4f6f8';
        ctx.fillRect(x, y, 32, 32);
      }
    }
    ctx.fillStyle = '#99ee2d';
    ctx.fillRect(0, 42, 512, 44);
    ctx.fillStyle = '#0a0b0f';
    ctx.font = '900 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CROWNS  ·  FINISH', 256, 65);
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
}

/** A soft round glow: white in the middle, fading to nothing. Light pools, underglow. */
function glowTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (ctx) => {
    const spot = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
    spot.addColorStop(0, 'rgba(255,255,255,1)');
    spot.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    spot.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, 64, 64);
  }, false);
}

/** A soft dark spot under each car. */
export function shadowTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (ctx) => {
    const spot = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
    spot.addColorStop(0, 'rgba(0,0,0,0.9)');
    spot.addColorStop(0.6, 'rgba(0,0,0,0.45)');
    spot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, 64, 64);
  }, false);
}

/** How far a point is from the road's middle line, in metres, and on which side (1 right of travel, -1 left). */
function toRoad(line: Flat[], x: number, z: number): { away: number; side: number } {
  let best = Infinity;
  let side = 1;
  line.forEach((a, i) => {
    const b = line[(i + 1) % line.length]!;
    const [dx, dz] = [b.x - a.x, b.z - a.z];
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const [ox, oz] = [x - a.x - dx * t, z - a.z - dz * t];
    const d = Math.hypot(ox, oz);
    if (d < best) {
      best = d;
      // Right of travel is (-dz, dx).
      side = -dz * ox + dx * oz >= 0 ? 1 : -1;
    }
  });
  return { away: best, side };
}

/** One instanced shape: a matrix and colour per copy. */
class Instances {
  private readonly list: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  private readonly dummy = new THREE.Object3D();
  constructor(
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
  ) {}

  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, turn: number, color: number, tilt = 0) {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(tilt, turn, 0);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    this.list.push({ m: this.dummy.matrix.clone(), c: new THREE.Color(color) });
  }

  build(group: THREE.Group, shadows: boolean, receive = shadows) {
    if (this.list.length === 0) return;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.list.length);
    this.list.forEach(({ m, c }, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadows;
    mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
}

type Own = <T extends { dispose: () => void }>(thing: T) => T;

/** Steps along each stretch of road every `every` metres: the spot, which way the road runs there, and which way is right. */
function alongRoad(line: Flat[], every: number, offset: number, visit: (at: Flat, d: Flat, r: Flat, turn: number, n: number) => void) {
  let n = 0;
  line.forEach((a, i) => {
    const b = line[(i + 1) % line.length]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const d = unit(b.x - a.x, b.z - a.z);
    for (let along = offset; along < length - offset / 2; along += every) {
      visit({ x: a.x + d.x * along, z: a.z + d.z * along }, d, right(d), Math.atan2(d.x, d.z), n);
      n += 1;
    }
  });
}

export type World = { group: THREE.Group; theme: Theme; dispose: () => void };

/** The whole world round one road: ground, road, edges, barriers, finish arch, lamps and scenery. */
export function buildWorld(track: Point[], map: number | undefined, shadows: boolean): World {
  const theme = themeOf(map);
  const line = flatten(track);
  const group = new THREE.Group();
  const owned: { dispose: () => void }[] = [];
  const own: Own = (thing) => {
    owned.push(thing);
    return thing;
  };
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, receive = true) => {
    const made = new THREE.Mesh(own(geometry), material);
    made.receiveShadow = receive && shadows;
    group.add(made);
    return made;
  };
  const harbour = theme.kind === 'harbour';

  // Ground far out into the haze: black water at the harbour, glossy enough to catch the lights.
  const ground = own(new THREE.MeshStandardMaterial({ color: theme.ground, roughness: harbour ? 0.06 : 0.95, metalness: harbour ? 0.85 : 0 }));
  const plane = mesh(new THREE.PlaneGeometry(2000, 2000), ground);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = harbour ? -1.2 : -0.05;

  // The land the road sits on. At the harbour it's a narrow quay edge on one side, so the water comes
  // right up to the barrier, and the wide container yard on the other.
  const apron = own(new THREE.MeshStandardMaterial({ color: theme.apron, roughness: harbour ? 0.45 : 0.9, metalness: harbour ? 0.2 : 0 }));
  if (harbour) mesh(band(line, -(WALL + 5), WALL + 70, -0.02), apron);
  else {
    const reach = WALL + (theme.kind === 'town' ? 16 : 40);
    mesh(band(line, -reach, reach, -0.02), apron);
  }

  // Between the road edge and the barrier: the slow part of the rules.
  const verge = own(new THREE.MeshStandardMaterial({ color: theme.verge, roughness: theme.kind === 'town' ? 0.6 : 0.95 }));
  mesh(band(line, -SIDE, -HALF_WIDTH, 0.0), verge);
  mesh(band(line, HALF_WIDTH, SIDE, 0.0), verge);

  // The road itself. Cobbles repeat small; asphalt stretches.
  const surface = own(roadTexture(theme));
  const road = own(new THREE.MeshStandardMaterial({ map: surface, roughness: theme.rough, metalness: theme.rough < 0.4 ? 0.35 : 0.05 }));
  if (theme.surface === 'cobble') mesh(band(line, -HALF_WIDTH, HALF_WIDTH, 0.02, 7, 0.25), road);
  else mesh(band(line, -HALF_WIDTH, HALF_WIDTH, 0.02, 1, 0.045), road);

  // Red and white kerbs on the plain roads; the named maps keep their own edges.
  if (theme.kerbs) {
    const kerbTexture = own(
      canvasTexture(32, 64, (ctx) => {
        ctx.fillStyle = '#e2342f';
        ctx.fillRect(0, 0, 32, 32);
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(0, 32, 32, 32);
      }),
    );
    const kerb = own(new THREE.MeshStandardMaterial({ map: kerbTexture, roughness: 0.6 }));
    mesh(band(line, -HALF_WIDTH - 1.1, -HALF_WIDTH + 0.2, 0.04, 1, 0.25), kerb);
    mesh(band(line, HALF_WIDTH - 0.2, HALF_WIDTH + 1.1, 0.04, 1, 0.25), kerb);
  }

  // The barriers: a quay wall, a steel guardrail or a kerb stone, as the map has it.
  const [railHeight, railDepth] = theme.rail;
  const wall = own(
    new THREE.MeshStandardMaterial({
      color: theme.wall,
      roughness: theme.kind === 'hill' ? 0.3 : 0.6,
      metalness: theme.kind === 'hill' ? 0.85 : 0.3,
      side: THREE.DoubleSide,
    }),
  );
  for (const side of [-1, 1]) {
    const made = mesh(barrier(line, side * SIDE, railDepth, railHeight), wall);
    made.castShadow = shadows;
  }
  if (theme.glow != null) {
    const strip = own(new THREE.MeshStandardMaterial({ color: theme.glow, emissive: theme.glow, emissiveIntensity: harbour ? 0.9 : 1.6 }));
    mesh(band(line, -SIDE - 0.05, -SIDE + 0.15, railHeight + 0.02), strip, false);
    mesh(band(line, SIDE - 0.15, SIDE + 0.05, railHeight + 0.02), strip, false);
  }
  if (theme.kind === 'hill') {
    // The guardrail's posts, every few metres down both sides.
    const posts = new Instances(own(new THREE.BoxGeometry(0.22, 1, 0.22)), wall);
    alongRoad(line, 4, 2, (at, _d, r, turn) => {
      for (const side of [-1, 1]) posts.add(at.x + r.x * side * (SIDE + 0.45), 0.4, at.z + r.z * side * (SIDE + 0.45), 1, 1.2, 1, turn, 0x6c737c);
    });
    posts.build(group, false);
  }

  // The finish arch over the start of the first stretch, where laps are counted.
  const start = line[0]!;
  const next = line[1]!;
  const arch = new THREE.Group();
  arch.position.set(start.x, 0, start.z);
  arch.rotation.y = Math.atan2(next.x - start.x, next.z - start.z);
  const banner = own(finishBanner());
  const lineMaterial = own(new THREE.MeshStandardMaterial({ map: banner, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
  const finishLine = new THREE.Mesh(own(new THREE.PlaneGeometry(HALF_WIDTH * 2, 2.6)), lineMaterial);
  finishLine.rotation.x = -Math.PI / 2;
  finishLine.position.y = 0.06;
  const pillar = own(new THREE.BoxGeometry(1.2, 10, 1.4));
  const pillarMaterial = own(new THREE.MeshStandardMaterial({ color: 0x101318, metalness: 0.7, roughness: 0.3 }));
  const beam = new THREE.Mesh(
    own(new THREE.BoxGeometry(SIDE * 2 + 2.4, 2.4, 1.3)),
    own(new THREE.MeshStandardMaterial({ map: banner, emissive: 0x99ee2d, emissiveIntensity: 0.25, roughness: 0.35 })),
  );
  beam.position.y = 9;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(pillar, pillarMaterial);
    post.position.set(side * (SIDE + 1.2), 5, 0);
    post.castShadow = shadows;
    arch.add(post);
  }
  arch.add(finishLine, beam);
  group.add(arch);

  // Light on the road: a soft pool under every lamp and lantern, the way wet ground catches it.
  const glow = own(glowTexture());
  const pools = new Instances(
    own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    own(new THREE.MeshBasicMaterial({ map: glow, color: 0xffffff, transparent: true, opacity: theme.kind === 'town' ? 0.42 : theme.kind === 'harbour' ? 0.16 : 0.3, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })),
  );

  // Lamp posts: both sides of the quay, one side up the hill. Old Town hangs lanterns on its houses instead.
  if (theme.kind !== 'town') {
    const post = new Instances(own(new THREE.BoxGeometry(0.3, 1, 0.3)), own(new THREE.MeshStandardMaterial({ color: 0x252b35, metalness: 0.7, roughness: 0.4 })));
    const head = new Instances(own(new THREE.BoxGeometry(1.4, 0.25, 0.5)), own(new THREE.MeshBasicMaterial({ color: theme.lamp, toneMapped: false })));
    const sides = theme.kind === 'hill' ? [1] : [-1, 1];
    const tall = harbour ? 9 : 7;
    alongRoad(line, theme.kind === 'hill' ? 44 : 36, 12, (at, _d, r, turn) => {
      for (const side of sides) {
        const [x, z] = [at.x + r.x * side * (SIDE + 2.2), at.z + r.z * side * (SIDE + 2.2)];
        post.add(x, tall / 2, z, 1, tall, 1, turn, 0xffffff);
        head.add(x - r.x * side * 0.8, tall, z - r.z * side * 0.8, 1, 1, 1, turn, 0xffffff);
        pools.add(x - r.x * side * 5, 0.07, z - r.z * side * 5, 16, 1, 16, 0, theme.lamp);
      }
    });
    post.build(group, false);
    head.build(group, false);
  }

  scenery(group, line, theme, own, shadows, pools);
  pools.build(group, false, false);

  return {
    group,
    theme,
    dispose: () => owned.forEach((thing) => thing.dispose()),
  };
}

/** The things round the road, none on the road or close to its barrier. */
function scenery(group: THREE.Group, line: Flat[], theme: Theme, own: Own, shadows: boolean, pools: Instances) {
  const xs = line.map((p) => p.x);
  const zs = line.map((p) => p.z);
  const margin = 90;
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - margin, Math.max(...xs) + margin, Math.min(...zs) - margin, Math.max(...zs) + margin];
  const [cx, cz] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const box = own(new THREE.BoxGeometry(1, 1, 1));

  if (theme.kind === 'harbour') {
    const containers = new Instances(box, own(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.45 })));
    const steel = new Instances(box, own(new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.6, emissive: 0x0a1420 })));
    const neon = new Instances(box, own(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })));
    const lit = own(windows());
    const towers = new Instances(box, own(new THREE.MeshStandardMaterial({ map: lit, emissiveMap: lit, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.35 })));
    const colours = [0x2f5d8a, 0xc0612e, 0x2f7a78, 0x8a3a2e, 0x3f4a5a, 0xb08a2e, 0x2a4a7a];
    const signs = [0xff3fd2, 0x3fe6ff, 0xc8ff4a, 0xff3fd2, 0x3fe6ff];
    const step = 13;
    for (let x = minX; x <= maxX; x += step) {
      for (let z = minZ; z <= maxZ; z += step) {
        const [gx, gz] = [Math.round(x / step), Math.round(z / step)];
        const [jx, jz] = [x + (noise(gx, gz, 11) - 0.5) * 4, z + (noise(gx, gz, 12) - 0.5) * 4];
        const { away, side } = toRoad(line, jx, jz);
        // Only the yard side: the other side of the quay is water.
        if (side < 0 || away < WALL + 9 || away > WALL + 66) continue;
        const pick = noise(gx, gz, 1);
        const turn = Math.round(noise(gx, gz, 13) * 2) * (Math.PI / 2);
        if (away > WALL + 38 && pick < 0.1) {
          // A gantry crane: four tall legs, a top beam and a long arm out over the water, with lit signs on it.
          const h = 26 + noise(gx, gz, 15) * 10;
          const frame = noise(gx, gz, 16) > 0.5 ? 0x2a8fb0 : 0x9a3a8a;
          for (const [lx, lz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) steel.add(jx + lx, h / 2, jz + lz, 0.9, h, 0.9, 0, frame);
          steel.add(jx, h, jz, 10, 1.2, 10, 0, frame);
          const arm = Math.atan2(cx - jx, cz - jz);
          steel.add(jx + Math.sin(arm) * 14, h + 2, jz + Math.cos(arm) * 14, 2, 1.6, 44, arm, frame);
          neon.add(jx + Math.sin(arm) * 6, h + 4.2, jz + Math.cos(arm) * 6, 0.4, 2, 9, arm, signs[Math.floor(noise(gx, gz, 17) * signs.length)]!);
          neon.add(jx, h - 3, jz, 8.4, 1.4, 0.3, arm, signs[Math.floor(noise(gx, gz, 18) * signs.length)]!);
          neon.add(jx + 4, h + 0.8, jz + 4, 0.5, 0.5, 0.5, 0, 0xff2a2a);
        } else if (pick < 0.62) {
          // A stack of shipping boxes, one to four high.
          const high = 1 + Math.floor(noise(gx, gz, 14) * (away < WALL + 20 ? 2 : 4));
          for (let level = 0; level < high; level += 1) containers.add(jx, 1.3 + level * 2.6, jz, 2.5, 2.6, 6.1, turn, colours[Math.floor(noise(gx, gz, 20 + level) * colours.length)]!);
        }
      }
    }
    // The city across the water: tall lit towers in a ring well beyond the quay, a few with neon tops.
    const ring = Math.max(maxX - minX, maxZ - minZ) / 2 + 110;
    for (let i = 0; i < 56; i += 1) {
      const a = (i / 56) * Math.PI * 2 + noise(i, 0, 31) * 0.1;
      const r = ring + noise(i, 1, 31) * 90;
      const [w, h] = [14 + noise(i, 2, 31) * 18, 30 + noise(i, 3, 31) * 110];
      const [tx, tz] = [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
      towers.add(tx, h / 2 - 1.2, tz, w, h, w, a, 0xffffff);
      if (noise(i, 4, 31) > 0.7) neon.add(tx, h + 0.6, tz, w * 0.8, 1.2, w * 0.8, a, signs[i % signs.length]!);
    }
    containers.build(group, shadows);
    steel.build(group, shadows);
    neon.build(group, false, false);
    towers.build(group, false);
    return;
  }

  if (theme.kind === 'hill') {
    // Pines: three stacked cones each, a short trunk; boulders by the road; ridge after ridge behind.
    const cone = own(new THREE.ConeGeometry(1, 1, 7));
    const trees = new Instances(cone, own(new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true })));
    const trunks = new Instances(box, own(new THREE.MeshStandardMaterial({ color: 0x2e2018, roughness: 0.9 })));
    const rocks = new Instances(own(new THREE.DodecahedronGeometry(1, 0)), own(new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true })));
    const ridges = new Instances(own(new THREE.ConeGeometry(1, 1, 6)), own(new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true })));
    const greens = [0x1a2d27, 0x203a2c, 0x16261f, 0x243f31, 0x1d3330];
    const step = 9;
    for (let x = minX; x <= maxX; x += step) {
      for (let z = minZ; z <= maxZ; z += step) {
        const [gx, gz] = [Math.round(x / step), Math.round(z / step)];
        const [jx, jz] = [x + (noise(gx, gz, 11) - 0.5) * 6, z + (noise(gx, gz, 12) - 0.5) * 6];
        const { away } = toRoad(line, jx, jz);
        if (away < WALL + 4) continue;
        const pick = noise(gx, gz, 2);
        if (away < WALL + 10 && pick < 0.22) {
          const r = 1.2 + noise(gx, gz, 15) * 2.6;
          rocks.add(jx, r * 0.45, jz, r * 1.2, r * 0.9, r, noise(gx, gz, 16) * 6, noise(gx, gz, 17) > 0.5 ? 0x6b6474 : 0x57515f);
        } else if (away >= WALL + 7 && pick < 0.72) {
          const h = 9 + noise(gx, gz, 13) * 12;
          const green = greens[Math.floor(noise(gx, gz, 14) * greens.length)]!;
          for (let tier = 0; tier < 3; tier += 1) {
            const size = h * (0.42 - tier * 0.1);
            trees.add(jx, 1.4 + h * (0.28 + tier * 0.24), jz, size * 0.7, h * 0.45, size * 0.7, noise(gx, gz, 18) * 3, green);
          }
          trunks.add(jx, 0.9, jz, 0.5, 1.8, 0.5, 0, 0xffffff);
        }
      }
    }
    // Mountains: a near ring darker, a far ring paler in the haze.
    for (const [ringOut, count, colour, base] of [[170, 24, 0x2a2440, 70], [320, 30, 0x40345c, 120]] as const) {
      const ring = Math.max(maxX - minX, maxZ - minZ) / 2 + ringOut;
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + noise(i, 1, ringOut) * 0.2;
        const [w, h] = [base * 1.4 + noise(i, 2, ringOut) * 90, base + noise(i, 3, ringOut) * base];
        ridges.add(cx + Math.cos(a) * ring, h / 2 - 1, cz + Math.sin(a) * ring, w, h, w, noise(i, 4, ringOut) * 3, colour);
      }
    }
    trees.build(group, shadows);
    trunks.build(group, false);
    rocks.build(group, shadows);
    ridges.build(group, false);
    return;
  }

  if (theme.kind === 'town') {
    // Tall old houses shoulder to shoulder along both sides of the street, each with lit windows,
    // a steep slate roof and, every other house, an iron lantern over the cobbles.
    const fronts = own(facade(false));
    const lights = own(facade(true));
    const houses = new Instances(box, own(new THREE.MeshStandardMaterial({ map: fronts, emissiveMap: lights, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.85 })));
    const roofs = new Instances(own(new THREE.ConeGeometry(0.75, 1, 4)), own(new THREE.MeshStandardMaterial({ color: 0x22232a, roughness: 0.7, flatShading: true })));
    const lanterns = new Instances(box, own(new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false })));
    const brackets = new Instances(box, own(new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.6, metalness: 0.6 })));
    const tints = [0xffffff, 0xe8d8c8, 0xd8c8b8, 0xc8bcb0, 0xf0dcc0];
    const placed: Flat[] = [];
    const clear = (x: number, z: number, room: number) => toRoad(line, x, z).away >= room;
    alongRoad(line, 9.5, 5, (at, d, r, turn, n) => {
      for (const side of [-1, 1]) {
        const depth = 8 + noise(n, side, 81) * 4;
        const lat = side * (SIDE + 2.4 + depth / 2);
        const [x, z] = [at.x + r.x * lat, at.z + r.z * lat];
        // Every corner of the house clear of the road, and not on top of one already built.
        const corners = [-1, 1].flatMap((u) => [-1, 1].map((v) => [x + d.x * u * 4.6 + r.x * v * (depth / 2), z + d.z * u * 4.6 + r.z * v * (depth / 2)] as const));
        if (!corners.every(([px, pz]) => clear(px, pz, SIDE + 1.8))) continue;
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 7)) continue;
        placed.push({ x, z });
        const h = 10 + noise(n, side, 82) * 11;
        houses.add(x, h / 2, z, depth, h, 9.2, turn, tints[Math.floor(noise(n, side, 83) * tints.length)]!);
        roofs.add(x, h + 2.2, z, depth * 0.98, 4.4, 9.2 * 0.98, turn + Math.PI / 4, 0xffffff);
        if (n % 2 === 0) {
          const [lx, lz] = [at.x + r.x * side * (SIDE + 1.6), at.z + r.z * side * (SIDE + 1.6)];
          brackets.add(lx + r.x * side * 0.4, 6.1, lz + r.z * side * 0.4, 0.12, 0.12, 1.2, turn + Math.PI / 2, 0xffffff);
          lanterns.add(lx, 5.6, lz, 0.55, 0.8, 0.55, turn, 0xffffff);
          pools.add(lx - r.x * side * 3.5, 0.07, lz - r.z * side * 3.5, 15, 1, 15, 0, 0xffa848);
        }
      }
    });
    // More houses behind, filling the blocks out to the haze.
    const step = 12;
    for (let x = minX; x <= maxX; x += step) {
      for (let z = minZ; z <= maxZ; z += step) {
        const [gx, gz] = [Math.round(x / step), Math.round(z / step)];
        if (noise(gx, gz, 3) < 0.15) continue;
        if (!clear(x, z, SIDE + 22) || placed.some((p) => Math.hypot(p.x - x, p.z - z) < 9)) continue;
        const h = 12 + noise(gx, gz, 15) * 16;
        const turn = Math.round(noise(gx, gz, 16) * 2) * (Math.PI / 2);
        houses.add(x, h / 2, z, 10, h, 10, turn, tints[Math.floor(noise(gx, gz, 17) * tints.length)]!);
        roofs.add(x, h + 2.4, z, 10, 4.8, 10, turn + Math.PI / 4, 0xffffff);
      }
    }
    houses.build(group, shadows);
    roofs.build(group, false);
    brackets.build(group, false);
    lanterns.build(group, false, false);
    return;
  }

  // Plain roads: low blocks with lit windows.
  const lit = own(windows());
  const houses = new Instances(box, own(new THREE.MeshStandardMaterial({ map: lit, emissiveMap: lit, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.7 })));
  const step = 16;
  for (let x = minX; x <= maxX; x += step) {
    for (let z = minZ; z <= maxZ; z += step) {
      const [gx, gz] = [Math.round(x / step), Math.round(z / step)];
      if (noise(gx, gz, 4) < 0.4 || toRoad(line, x, z).away < WALL + 8) continue;
      const h = 6 + noise(gx, gz, 15) * 14;
      houses.add(x, h / 2, z, 9, h, 9, 0, 0xffffff);
    }
  }
  houses.build(group, shadows);
}

/** One car: body, glass, wing, lights, wheels and boost flames, in its paint. Faces +z. */
export type CarRig = {
  root: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Group[];
  fronts: THREE.Group[];
  flames: THREE.Mesh[];
  paint: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  tag: THREE.Sprite;
  dispose: () => void;
};

/**
 * A car: a low graphite body with neon trim in the car's colour, glowing rims and a pool of the same
 * colour on the road under it, so every car is known by its glow, as in the posters.
 */
export function buildCar(color: string, shadow: THREE.Texture, shadows: boolean): CarRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const owned: { dispose: () => void }[] = [];
  const own = <T extends { dispose: () => void }>(thing: T): T => {
    owned.push(thing);
    return thing;
  };
  const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    parent.add(part);
    return part;
  };
  const tone = new THREE.Color(color);

  const spot = new THREE.Mesh(own(new THREE.PlaneGeometry(3.6, 6.4)), own(new THREE.MeshBasicMaterial({ map: shadow, transparent: true, opacity: 0.6, depthWrite: false })));
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = 0.05;
  root.add(spot);

  // Underglow: the car's colour spilled on the road beneath it.
  const glow = new THREE.Mesh(
    own(new THREE.PlaneGeometry(5.2, 8.2)),
    own(new THREE.MeshBasicMaterial({ map: own(glowTexture()), color: tone, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.08;
  root.add(glow);

  // A low wedge: long nose, cab set back, short tail.
  const side = new THREE.Shape();
  side.moveTo(-2.6, 0.26);
  side.lineTo(2.6, 0.26);
  side.lineTo(2.68, 0.5);
  side.lineTo(1.6, 0.72);
  side.lineTo(0.5, 1.22);
  side.lineTo(-1.1, 1.22);
  side.lineTo(-2.05, 0.84);
  side.lineTo(-2.6, 0.78);
  side.closePath();
  const width = 2.3;
  const shell = own(new THREE.ExtrudeGeometry(side, { depth: width, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.07, bevelSegments: 2 }));
  shell.translate(0, 0, -width / 2);
  shell.rotateY(-Math.PI / 2);
  shell.computeVertexNormals();
  // Graphite with a hint of the car's colour, glossy.
  const paint = own(new THREE.MeshStandardMaterial({ color: new THREE.Color(0x1c1f26).lerp(tone, 0.22), metalness: 0.75, roughness: 0.26 }));
  const hull = add(body, shell, paint, 0, 0, 0);
  hull.castShadow = shadows;

  const dark = own(new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.7, metalness: 0.2 }));
  add(body, own(new THREE.BoxGeometry(2.5, 0.12, 5.4)), dark, 0, 0.26, 0);
  const glass = own(new THREE.MeshStandardMaterial({ color: 0x070b14, metalness: 0.5, roughness: 0.06 }));
  add(body, own(new THREE.BoxGeometry(1.9, 0.34, 2.1)), glass, 0, 1.06, -0.25);

  // Neon trim: a line down each flank, a stripe over the roof, two strokes on the bonnet.
  const neon = own(new THREE.MeshBasicMaterial({ color: tone, toneMapped: false }));
  const flank = own(new THREE.BoxGeometry(0.05, 0.07, 4.4));
  add(body, flank, neon, -1.24, 0.5, 0.05);
  add(body, flank, neon, 1.24, 0.5, 0.05);
  add(body, own(new THREE.BoxGeometry(0.16, 0.04, 2.0)), neon, 0, 1.25, -0.3);
  const stroke = own(new THREE.BoxGeometry(0.08, 0.04, 1.4));
  for (const x of [-0.5, 0.5]) {
    const line = add(body, stroke, neon, x, 0.74, 1.6);
    line.rotation.set(-0.2, x * 0.5, 0);
  }

  // Rear wing.
  add(body, own(new THREE.BoxGeometry(2.5, 0.08, 0.45)), dark, 0, 1.35, -2.35);
  const strut = own(new THREE.BoxGeometry(0.08, 0.45, 0.22));
  add(body, strut, dark, -0.7, 1.1, -2.3);
  add(body, strut, dark, 0.7, 1.1, -2.3);

  // Lights: white at the front, a red bar at the back that glows brighter on the brakes.
  const headlight = own(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f4ff, emissiveIntensity: 3 }));
  const lamp = own(new THREE.BoxGeometry(0.5, 0.12, 0.08));
  add(body, lamp, headlight, -0.8, 0.55, 2.66);
  add(body, lamp, headlight, 0.8, 0.55, 2.66);
  const tail = own(new THREE.MeshStandardMaterial({ color: 0xff2233, emissive: 0xff1e38, emissiveIntensity: 1.6 }));
  add(body, own(new THREE.BoxGeometry(2.0, 0.12, 0.08)), tail, 0, 0.72, -2.64);

  // Boost flames out of the two pipes.
  const flameShape = own(new THREE.ConeGeometry(0.2, 1.8, 10));
  flameShape.rotateX(-Math.PI / 2);
  flameShape.translate(0, 0, -0.9);
  const flameMaterial = own(new THREE.MeshBasicMaterial({ color: 0x99ee2d, transparent: true, opacity: 0.9 }));
  const flames = [-0.55, 0.55].map((x) => {
    const flame = add(body, flameShape, flameMaterial, x, 0.34, -2.7);
    flame.visible = false;
    return flame;
  });

  // Wheels with glowing rims in the car's colour.
  const tyre = own(new THREE.CylinderGeometry(0.44, 0.44, 0.36, 16));
  tyre.rotateZ(Math.PI / 2);
  const rim = own(new THREE.CylinderGeometry(0.29, 0.29, 0.38, 10));
  rim.rotateZ(Math.PI / 2);
  const rubber = own(new THREE.MeshStandardMaterial({ color: 0x0d0f13, roughness: 0.85 }));
  const rimGlow = own(new THREE.MeshBasicMaterial({ color: tone, toneMapped: false }));
  const wheels: THREE.Group[] = [];
  const fronts: THREE.Group[] = [];
  for (const [x, z, front] of [[-1.18, 1.65, true], [1.18, 1.65, true], [-1.2, -1.6, false], [1.2, -1.6, false]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.44, z);
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(tyre, rubber), new THREE.Mesh(rim, rimGlow));
    pivot.add(spin);
    root.add(pivot);
    wheels.push(spin);
    if (front) fronts.push(pivot);
  }

  const tag = new THREE.Sprite(own(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })));
  tag.position.y = 3.4;
  tag.scale.set(5, 1.25, 1);
  root.add(tag);

  return {
    root,
    body,
    wheels,
    fronts,
    flames,
    paint,
    tail,
    tag,
    dispose: () => {
      (tag.material as THREE.SpriteMaterial).map?.dispose();
      owned.forEach((thing) => thing.dispose());
    },
  };
}

/** A car's floating tag: its name over a health bar. */
export function tagTexture(name: string, color: string, hp: number, wrecked: boolean): THREE.CanvasTexture {
  const texture = canvasTexture(256, 64, (ctx) => {
    ctx.font = '700 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(name, 128, 24);
    ctx.fillText(name, 128, 24);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(48, 36, 160, 14);
    const share = Math.max(0, Math.min(1, hp / RALLY.MAX_HP));
    ctx.fillStyle = wrecked ? '#ff3b3b' : share > 0.5 ? color : share > 0.25 ? '#e1bf47' : '#ff5a3d';
    ctx.fillRect(50, 38, 156 * share, 10);
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
