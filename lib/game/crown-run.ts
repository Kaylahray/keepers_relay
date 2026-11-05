/** Crown Run, as the browser runs it: the same Rust rules the game script runs on chain, compiled to wasm (`scripts/sudden-death/crown-run-wasm`). */

export const CROWN_RUN = {
  TICK_HZ: 30,
  LAPS: 5,
  LAP_TICKS: 900,
  MAX_TICKS: 4500,
  LANES: 3,
  LANE_W: 1000,
  VIEW_DEPTH: 6000,
  EVENT_LEN: 3,
  MAX_EVENTS: 4096,
  MAX_PICK_BYTES: 7,
  /** The app's timer on the pick screen. The chain does not enforce it. */
  PICK_SECONDS: 20,
  /** A lap only starts with this long left: 30 s driving, 20 s picking, 15 s to spare. */
  LAP_NEEDS_MS: 65_000,
  /** A lock sent this close to the end of its window might land after it, so the page counts down to this margin. */
  LOCK_MARGIN_MS: 15_000,
  /** A full run, about. Warned about before paying when the clock has less. */
  RUN_NEEDS_MS: 6 * 60_000,
  /** For an entry to land and one lap to lock on a busy network. New entries close with less on the clock. */
  ENTRY_NEEDS_MS: 4 * 60_000,
} as const;

export const SHIELD = 0;
export const MAGNET = 1;
export const OVERDRIVE = 2;
export const FORTUNE = 3;
export const COMBO = 4;

export const SAFE = 0;
export const DANGER = 1;

export const UPGRADES = [
  { id: SHIELD, name: 'Shield', effect: 'Survive one crash.' },
  { id: MAGNET, name: 'Magnet', effect: 'Grab coins from further away.' },
  { id: OVERDRIVE, name: 'Overdrive', effect: 'A faster road: more distance, less warning.' },
  { id: FORTUNE, name: 'Fortune', effect: 'Coins are worth 100, up from 50.' },
  { id: COMBO, name: 'Combo Master', effect: 'Each coin in a row is worth 10 more, up to +100. A miss resets it.' },
] as const;

/** Finish bonus for a danger road, by lap from zero. Lap 1 is always safe. */
export const DANGER_BONUS = [0, 700, 600, 500, 400] as const;

/** Used when the pick timer runs out with nothing chosen: the least risky upgrade left. */
const FALLBACK_ORDER = [MAGNET, FORTUNE, COMBO, OVERDRIVE, SHIELD];

export function fallbackUpgrade(owned: number): number {
  return FALLBACK_ORDER.find((id) => !hasUpgrade(owned, id)) ?? MAGNET;
}

export function hasUpgrade(owned: number, id: number): boolean {
  return (owned & (1 << id)) !== 0;
}

/** How many pick bytes a clean lap ends with, by its index from zero. */
export function picksDue(lap: number): number {
  if (lap <= 2) return 2;
  return lap === 3 ? 1 : 0;
}

export type RunRow = {
  /** Distance from the player. 0 is the player's line, VIEW_DEPTH the horizon. */
  y: number;
  /** Bit n set: lane n is blocked. */
  blocked: number;
  /** Lane holding a coin, or -1. */
  coin: number;
  /** Lane this row's block will slide to, or -1. */
  shift: number;
};

/** A lap as the chain sees it: its road's seed, then its moves and picks. */
export type LockedLap = { seed: bigint; bytes: Uint8Array };

export type CrownRun = {
  start(seed: bigint): void;
  /** Starts the next lap's random numbers; everything else carries over. */
  reseed(seed: bigint): void;
  /** One tick. `lane` is this tick's input, or null for none. */
  step(lane: number | null): void;
  /** Applies a clean lap's picks. Returns whether they were legal. */
  choose(upgrade: number | null, road: number): boolean;
  over(): boolean;
  crashed(): boolean;
  tick(): number;
  target(): number;
  x(): number;
  speed(): number;
  score(): number;
  coins(): number;
  owned(): number;
  road(): number;
  shieldReady(): boolean;
  streak(): number;
  rows(): RunRow[];
  /** Score of a whole run, or null if any lap is illegal. */
  replay(laps: LockedLap[]): number | null;
};

type Exports = {
  memory: WebAssembly.Memory;
  run_new(hi: number, lo: number): void;
  run_reseed(hi: number, lo: number): void;
  run_step(lane: number): void;
  run_choose(upgrade: number, road: number): number;
  run_over(): number;
  run_crashed(): number;
  run_tick(): number;
  run_target(): number;
  run_x(): number;
  run_speed(): number;
  run_score(): number;
  run_coins(): number;
  run_owned(): number;
  run_road(): number;
  run_shield_ready(): number;
  run_streak(): number;
  run_row_count(): number;
  run_row(index: number): number;
  buffer_ptr(): number;
  replay_run(len: number): number;
};

function halves(seed: bigint): [number, number] {
  const value = BigInt.asUintN(64, seed);
  return [Number(value >> 32n), Number(value & 0xffff_ffffn)];
}

/** Game ABI v2: lap count, then per lap `seed u64 LE ‖ length u16 LE ‖ moves and picks`. */
export function encodeRun(laps: LockedLap[]): Uint8Array {
  const raw = new Uint8Array(1 + laps.reduce((sum, lap) => sum + 10 + lap.bytes.length, 0));
  const view = new DataView(raw.buffer);
  raw[0] = laps.length;
  let at = 1;
  for (const lap of laps) {
    view.setBigUint64(at, BigInt.asUintN(64, lap.seed), true);
    view.setUint16(at + 8, lap.bytes.length, true);
    raw.set(lap.bytes, at + 10);
    at += 10 + lap.bytes.length;
  }
  return raw;
}

const WASM_URL = '/games/crown-run.wasm';
let cached: Promise<CrownRun> | null = null;

/** Loads the wasm once per page. Pass bytes to load it outside a browser. */
export function loadCrownRun(bytes?: BufferSource): Promise<CrownRun> {
  if (!bytes && cached) return cached;
  const task = (async () => {
    const source = bytes ?? (await (await fetch(WASM_URL)).arrayBuffer());
    const { instance } = await WebAssembly.instantiate(source, {});
    const api = instance.exports as unknown as Exports;
    return {
      start: (seed) => api.run_new(...halves(seed)),
      reseed: (seed) => api.run_reseed(...halves(seed)),
      step: (lane) => api.run_step(lane == null ? 255 : lane),
      choose: (upgrade, road) => api.run_choose(upgrade == null ? 255 : upgrade, road) === 1,
      over: () => api.run_over() === 1,
      crashed: () => api.run_crashed() === 1,
      tick: () => api.run_tick(),
      target: () => api.run_target(),
      x: () => api.run_x(),
      speed: () => api.run_speed(),
      score: () => api.run_score(),
      coins: () => api.run_coins(),
      owned: () => api.run_owned(),
      road: () => api.run_road(),
      shieldReady: () => api.run_shield_ready() === 1,
      streak: () => api.run_streak(),
      rows() {
        const count = api.run_row_count();
        const rows: RunRow[] = [];
        for (let i = 0; i < count; i += 1) {
          const packed = api.run_row(i);
          rows.push({ y: packed >> 12, shift: ((packed >> 8) & 0xf) - 1, coin: ((packed >> 4) & 0xf) - 1, blocked: packed & 0xf });
        }
        return rows;
      },
      replay(laps) {
        const raw = encodeRun(laps);
        const limit = 1 + CROWN_RUN.LAPS * 10 + CROWN_RUN.MAX_EVENTS * CROWN_RUN.EVENT_LEN + CROWN_RUN.MAX_PICK_BYTES;
        if (laps.length === 0 || laps.length > CROWN_RUN.LAPS || raw.length > limit) return null;
        // buffer_ptr may grow memory on first use, which detaches any earlier view of the buffer.
        const ptr = api.buffer_ptr();
        new Uint8Array(api.memory.buffer, ptr, raw.length).set(raw);
        const score = api.replay_run(raw.length);
        return score < 0 ? null : score;
      },
    } satisfies CrownRun;
  })();
  if (!bytes) {
    cached = task;
    task.catch(() => {
      cached = null;
    });
  }
  return task;
}

/** Puts the run where the next lap starts: replays the locked laps and their picks, then seeds the new road. */
export function restore(runner: CrownRun, laps: LockedLap[], seed: bigint) {
  runner.start(laps[0]?.seed ?? seed);
  laps.forEach((lap, k) => {
    if (k > 0) runner.reseed(lap.seed);
    const extra = lap.bytes.length % CROWN_RUN.EVENT_LEN;
    const count = (lap.bytes.length - extra) / CROWN_RUN.EVENT_LEN;
    const end = (k + 1) * CROWN_RUN.LAP_TICKS;
    let cursor = 0;
    while (!runner.over() && runner.tick() < end) {
      let input: number | null = null;
      const at = cursor * CROWN_RUN.EVENT_LEN;
      if (cursor < count && (lap.bytes[at]! | (lap.bytes[at + 1]! << 8)) === runner.tick()) {
        input = lap.bytes[at + 2]!;
        cursor += 1;
      }
      runner.step(input);
    }
    if (!runner.crashed() && picksDue(k) > 0) {
      const road = lap.bytes[lap.bytes.length - 1]!;
      runner.choose(picksDue(k) === 2 ? lap.bytes[lap.bytes.length - 2]! : null, road);
    }
  });
  if (laps.length > 0) runner.reseed(seed);
}

/** Records lane changes as `tick u16 LE ‖ lane u8`, the format the game script reads. */
export class MoveRecorder {
  private bytes: number[] = [];

  /** Records `lane` at `tick` if it changes the target. Returns whether it was recorded. */
  record(tick: number, lane: number, current: number): boolean {
    if (lane === current || this.bytes.length >= CROWN_RUN.MAX_EVENTS * CROWN_RUN.EVENT_LEN) return false;
    this.bytes.push(tick & 0xff, (tick >> 8) & 0xff, lane);
    return true;
  }

  moves(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** The picks at the end of a clean lap's bytes, by its index from zero. */
export function picksOf(bytes: Uint8Array, lap: number): { upgrade: number | null; road: number | null } {
  const extra = bytes.length % CROWN_RUN.EVENT_LEN;
  if (extra === 0) return { upgrade: null, road: null };
  return { upgrade: picksDue(lap) === 2 ? bytes[bytes.length - 2]! : null, road: bytes[bytes.length - 1]! };
}

/** The upgrades a run holds and the road it is on, after these laps. */
export function runState(laps: Uint8Array[]): { owned: number; road: number } {
  let owned = 0;
  let road = SAFE;
  laps.forEach((bytes, lap) => {
    const picks = picksOf(bytes, lap);
    if (picks.upgrade != null) owned |= 1 << picks.upgrade;
    if (picks.road != null) road = picks.road;
  });
  return { owned, road };
}

/** What a run locked in and then ended before using, or null. */
export function unusedPicks(laps: Uint8Array[]): string | null {
  const last = laps.at(-1);
  if (!last || laps.length >= CROWN_RUN.LAPS) return null;
  const { upgrade, road } = picksOf(last, laps.length - 1);
  if (road == null) return null;
  const upgradeName = upgrade == null ? null : UPGRADES[upgrade]?.name;
  const roadName = road === DANGER ? 'Danger road' : 'Safe road';
  return `Locked in but never used: ${upgradeName ? `${upgradeName}, ` : ''}${roadName}.`;
}

/** A lap's moves with its picks on the end, ready to lock. */
export function withPicks(moves: Uint8Array, upgrade: number | null, road: number | null): Uint8Array {
  const picks = [...(upgrade == null ? [] : [upgrade]), ...(road == null ? [] : [road])];
  const bytes = new Uint8Array(moves.length + picks.length);
  bytes.set(moves);
  bytes.set(picks, moves.length);
  return bytes;
}
