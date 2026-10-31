/** Artillery duel rules, mirrored exactly by the Rust crate `crowns-artillery-core` that the chain runs (scripts/sudden-death/contracts/artillery-core). */

export const WORLD_W = 960;
export const WORLD_H = 540;
export const MAX_HP = 100;
/** Fifteen shots each, then the healthier tank wins. */
export const MAX_TURNS = 30;
export const TANK_HALF_W = 14;
export const TANK_H = 14;
const BARREL = 18;
const FP = 256;
const GRAVITY = 6;
const SPEED_PER_POWER = 12;
const MAX_STEPS = 3000;
const BLAST_RADIUS = 30;
const DAMAGE_RADIUS = 45;
const MAX_DAMAGE = 50;
export const MAX_WIND = 10;
/** A skipped turn: the player to move ran out of time, so no shell flies and the turn passes. */
export const PASS = 255;
export const PASS_SHOT: ShotRecord = { angle: PASS, power: 0, wind: 0 };
/** The tower stands within this many pixels of the middle of the field. */
const TOWER_CENTRE = WORLD_W / 2;
const TOWER_DRIFT = 40;

/** sin(d) × 1024 for d = 0…90 degrees, as a literal so every port agrees. */
const SIN = [
  0, 18, 36, 54, 71, 89, 107, 125, 143, 160, 178, 195, 213, 230, 248, 265, 282, 299, 316, 333, 350, 367, 384, 400, 416, 433,
  449, 465, 481, 496, 512, 527, 543, 558, 573, 587, 602, 616, 630, 644, 658, 672, 685, 698, 711, 724, 737, 749, 761, 773, 784,
  796, 807, 818, 828, 839, 849, 859, 868, 878, 887, 896, 904, 912, 920, 928, 935, 943, 949, 956, 962, 968, 974, 979, 984, 989,
  994, 998, 1002, 1005, 1008, 1011, 1014, 1016, 1018, 1020, 1022, 1023, 1023, 1024, 1024,
];

/** Angle in whole degrees: 0 points right, 90 straight up, 180 left. */
function sinDeg(angle: number): number {
  return angle <= 90 ? SIN[angle]! : SIN[180 - angle]!;
}
function cosDeg(angle: number): number {
  return angle <= 90 ? SIN[90 - angle]! : -SIN[angle - 90]!;
}

/** Integer division that truncates toward zero, as Rust's `/` does on integers. */
function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = n;
  let y = div(x + 1, 2);
  while (y < x) {
    x = y;
    y = div(x + div(n, x), 2);
  }
  return x;
}

/** xorshift32. The seed will be a block hash on chain; here it is any 32-bit number. */
function rng(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

export type Tank = { x: number; hp: number };
export type Side = 0 | 1;

export type ArtilleryState = {
  seed: number;
  heights: number[];
  tanks: [Tank, Tank];
  /** Shots fired so far. Even turns are side 0 (the challenger), odd turns side 1. */
  turn: number;
  /** Who won, 'draw', or null while the duel is on. */
  winner: Side | 'draw' | null;
};

export type Shot = { angle: number; power: number };
/** A shot as the duel records it: the aim, and the wind it flew in. */
export type ShotRecord = Shot & { wind: number };

export type ShotResult = {
  next: ArtilleryState;
  /** Where the shell flew, in pixels (y-up), for drawing. */
  path: { x: number; y: number }[];
  /** Where it burst, or null if it left the field. */
  impact: { x: number; y: number } | null;
  damage: [number, number];
  /** It struck a tank's body, not the ground near it. */
  direct: boolean;
};

export function sideToMove(state: ArtilleryState): Side {
  return (state.turn % 2) as Side;
}

/** Practice wind for a turn, from −10 (to the left) to 10. In a real duel the wind comes from the block the last shot landed in instead (see `windFromBlock`), so nobody knows it early. */
export function windFor(seed: number, turn: number): number {
  const next = rng((seed ^ Math.imul(turn + 1, 0x9e3779b9)) >>> 0);
  next();
  return (next() % (2 * MAX_WIND + 1)) - MAX_WIND;
}

/** Low rolling ground, two tank pads, and a tower in the middle that every shot has to clear (and that craters chip away), all from the seed. */
export function newDuel(seed: number): ArtilleryState {
  const next = rng(seed);
  const spacing = 160;
  const points: number[] = [];
  for (let i = 0; i <= WORLD_W / spacing; i += 1) points.push(70 + (next() % 61));
  let heights: number[] = [];
  for (let x = 0; x < WORLD_W; x += 1) {
    const i = div(x, spacing);
    const t = x - i * spacing;
    heights.push(points[i]! + div((points[i + 1]! - points[i]!) * t, spacing));
  }
  for (let pass = 0; pass < 3; pass += 1) {
    const smoothed: number[] = [];
    for (let x = 0; x < WORLD_W; x += 1) {
      let sum = 0;
      for (let k = -4; k <= 4; k += 1) sum += heights[Math.min(WORLD_W - 1, Math.max(0, x + k))]!;
      smoothed.push(div(sum, 9));
    }
    heights = smoothed;
  }
  const left = 90 + (next() % 80);
  const right = WORLD_W - 90 - (next() % 80);
  for (const x of [left, right]) {
    const pad = heights[x]!;
    for (let k = -TANK_HALF_W - 4; k <= TANK_HALF_W + 4; k += 1) heights[x + k] = pad;
  }
  const tower = TOWER_CENTRE - TOWER_DRIFT + (next() % (2 * TOWER_DRIFT + 1));
  const half = 18 + (next() % 9);
  const top = heights[tower]! + 120 + (next() % 81);
  for (let k = -half; k <= half; k += 1) heights[tower + k] = top;
  return {
    seed: seed >>> 0,
    heights,
    tanks: [
      { x: left, hp: MAX_HP },
      { x: right, hp: MAX_HP },
    ],
    turn: 0,
    winner: null,
  };
}

export function clampShot(shot: Shot): Shot {
  return {
    angle: Math.min(180, Math.max(0, Math.round(shot.angle))),
    power: Math.min(100, Math.max(0, Math.round(shot.power))),
  };
}

/** The barrel's tip for a tank aiming at `angle`, in pixels. */
export function barrelTip(state: ArtilleryState, side: Side, angle: number): { x: number; y: number } {
  const tank = state.tanks[side];
  const ground = state.heights[tank.x]!;
  return {
    x: tank.x + div(cosDeg(angle) * BARREL, 1024),
    y: ground + TANK_H + div(sinDeg(angle) * BARREL, 1024),
  };
}

/** Wind from a block hash: the first four bytes, as a number from −10 to 10. */
export function windFromBlock(hash: Uint8Array): number {
  const value = (hash[0]! | (hash[1]! << 8) | (hash[2]! << 16) | (hash[3]! << 24)) >>> 0;
  return (value % (2 * MAX_WIND + 1)) - MAX_WIND;
}

export function isPass(shot: Shot): boolean {
  return shot.angle === PASS;
}

/** Fires the side to move, or passes their turn. The state passed in is not changed. */
export function fire(state: ArtilleryState, raw: Shot, wind: number): ShotResult {
  if (state.winner !== null) throw new Error('This duel is over.');
  if (!Number.isInteger(wind) || Math.abs(wind) > MAX_WIND) throw new Error('Wind out of range.');
  if (isPass(raw)) {
    if (raw.power !== 0 || wind !== 0) throw new Error('A skipped turn has no power or wind.');
    const tanks: [Tank, Tank] = [{ ...state.tanks[0] }, { ...state.tanks[1] }];
    return { next: endTurn(state, state.heights.slice(), tanks), path: [], impact: null, damage: [0, 0], direct: false };
  }
  const shot = clampShot(raw);
  const side = sideToMove(state);
  const heights = state.heights.slice();
  const tanks: [Tank, Tank] = [{ ...state.tanks[0] }, { ...state.tanks[1] }];

  const tip = barrelTip(state, side, shot.angle);
  let x = tip.x * FP;
  let y = tip.y * FP;
  const speed = shot.power * SPEED_PER_POWER;
  let vx = div(speed * cosDeg(shot.angle), 1024);
  let vy = div(speed * sinDeg(shot.angle), 1024);
  const path = [{ x: tip.x, y: tip.y }];
  let impact: { x: number; y: number } | null = null;
  let direct = false;

  for (let step = 1; step <= MAX_STEPS; step += 1) {
    x += vx;
    y += vy;
    vy -= GRAVITY;
    if (step % 8 === 0) vx += wind;
    if (x < 0) break;
    const px = div(x, FP);
    const py = Math.floor(y / FP);
    if (px >= WORLD_W) break;
    if (step % 2 === 0) path.push({ x: px, y: py });
    // The shell clears its own barrel before it can hit anything.
    if (step > 4) {
      for (const tank of tanks) {
        const ground = heights[tank.x]!;
        if (Math.abs(px - tank.x) <= TANK_HALF_W && py >= ground && py <= ground + TANK_H + 2) {
          impact = { x: px, y: py };
          direct = true;
        }
      }
    }
    if (!impact && py <= heights[px]!) impact = { x: px, y: Math.max(0, py) };
    if (impact) {
      path.push(impact);
      break;
    }
  }

  const damage: [number, number] = [0, 0];
  if (impact) {
    tanks.forEach((tank, index) => {
      const dx = tank.x - impact!.x;
      const dy = heights[tank.x]! + div(TANK_H, 2) - impact!.y;
      const distance = isqrt(dx * dx + dy * dy);
      if (distance < DAMAGE_RADIUS) damage[index] = div((DAMAGE_RADIUS - distance) * MAX_DAMAGE, DAMAGE_RADIUS);
    });
    for (let dx = -BLAST_RADIUS; dx <= BLAST_RADIUS; dx += 1) {
      const column = impact.x + dx;
      if (column < 0 || column >= WORLD_W) continue;
      const floor = Math.max(0, impact.y - isqrt(BLAST_RADIUS * BLAST_RADIUS - dx * dx));
      if (heights[column]! > floor) heights[column] = floor;
    }
    tanks[0].hp = Math.max(0, tanks[0].hp - damage[0]);
    tanks[1].hp = Math.max(0, tanks[1].hp - damage[1]);
  }

  return { next: endTurn(state, heights, tanks), path, impact, damage, direct };
}

/** The board after a turn: the next turn, and a winner if a tank is gone or the turns have run out. */
function endTurn(state: ArtilleryState, heights: number[], tanks: [Tank, Tank]): ArtilleryState {
  const turn = state.turn + 1;
  let winner: ArtilleryState['winner'] = null;
  if (tanks[0].hp === 0 && tanks[1].hp === 0) winner = 'draw';
  else if (tanks[0].hp === 0) winner = 1;
  else if (tanks[1].hp === 0) winner = 0;
  else if (turn >= MAX_TURNS) winner = tanks[0].hp === tanks[1].hp ? 'draw' : tanks[0].hp > tanks[1].hp ? 0 : 1;
  return { ...state, heights, tanks, turn, winner };
}

/** Plays a whole duel from its seed and shots: what the chain will do to judge it. */
export function replay(seed: number, shots: ShotRecord[]): ArtilleryState {
  let state = newDuel(seed);
  for (const shot of shots) {
    if (state.winner !== null) break;
    state = fire(state, shot, shot.wind).next;
  }
  return state;
}
