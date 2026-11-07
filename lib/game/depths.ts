/** Crown Depths, as the browser runs it: the same Rust rules the game script runs on chain, compiled to wasm (`scripts/sudden-death/depths-wasm`). */

import type { LockedLap } from '@/lib/game/crown-run';
import { encodeRun } from '@/lib/game/crown-run';

export const DEPTHS = {
  TICK_HZ: 10,
  FLOORS: 4,
  FLOOR_TICKS: 600,
  LANTERN_TICKS: 200,
  ROOMS: 3,
  ROOM: 5,
  CELL: 6,
  MAP: 19,
  EVENT_LEN: 3,
  MAX_EVENTS: 800,
  /** The app's timer on the pick screen. The chain does not enforce it. */
  PICK_SECONDS: 20,
  /** A floor only starts with this long left: 80 s with the Lantern, 20 s picking, 15 s to spare. */
  LAP_NEEDS_MS: 115_000,
  /** A lock sent this close to the end of its window might land after it, so the page counts down to this margin. */
  LOCK_MARGIN_MS: 15_000,
  /** A full run, about. Warned about before paying when the clock has less. */
  RUN_NEEDS_MS: 9 * 60_000,
  /** For an entry to land and one floor to lock on a busy network. New entries close with less on the clock. */
  ENTRY_NEEDS_MS: 4 * 60_000,
} as const;

export const UP = 0;
export const RIGHT = 1;
export const DOWN = 2;
export const LEFT = 3;

export const WALL = 0;
export const FLOOR = 1;
export const DOOR = 2;
export const STAIRS = 3;

export const NOTHING = 0;
export const GOLD = 1;
export const KEY = 2;
export const CHEST = 3;
export const SHRINE = 4;

export const SLIME = 0;
export const BAT = 1;
export const KNIGHT = 2;

export const SWORD = 0;
export const ARMOR = 1;
export const BOOTS = 2;
export const LANTERN = 3;
export const GREED = 4;

export const SAFE = 0;
export const DEEP = 1;

export const RELICS = [
  { id: SWORD, name: 'Sword', effect: 'Beat knights in one hit.' },
  { id: ARMOR, name: 'Armor', effect: '2 more hearts.' },
  { id: BOOTS, name: 'Boots', effect: 'Walk twice as fast.' },
  { id: LANTERN, name: 'Lantern', effect: '20 more seconds of torch on every floor.' },
  { id: GREED, name: 'Gold Bag', effect: 'Gold and chests are worth double.' },
] as const;

export const MONSTERS = [
  { id: SLIME, name: 'Slime', note: 'Slow. One hit beats it.' },
  { id: BAT, name: 'Bat', note: 'Fast, flies about. One hit.' },
  { id: KNIGHT, name: 'Knight', note: 'Takes 2 hits. Costs you 2 hearts.' },
] as const;

/** The bonus for clearing a deep floor, by its index from zero. */
export function deepBonus(floor: number): number {
  return 150 * floor;
}

/** Used when the pick timer runs out with nothing chosen. */
const FALLBACK_ORDER = [ARMOR, LANTERN, SWORD, BOOTS, GREED];

export function fallbackRelic(owned: number): number {
  return FALLBACK_ORDER.find((id) => !hasRelic(owned, id)) ?? ARMOR;
}

export function hasRelic(owned: number, id: number): boolean {
  return (owned & (1 << id)) !== 0;
}

/** How many pick bytes a cleared floor ends with, by its index from zero. */
export function picksDue(floor: number): number {
  return floor < DEPTHS.FLOORS - 1 ? 2 : 0;
}

export type Monster = { x: number; y: number; kind: number; hp: number; placed: boolean };

export type Depths = {
  start(seed: bigint): void;
  /** Goes down to the next floor; everything the player carries comes along. */
  descend(seed: bigint): void;
  /** One tick. `dir` is this tick's step, or null for none. Returns whether the step was legal. */
  step(dir: number | null): boolean;
  stepOk(dir: number): boolean;
  /** Applies a cleared floor's picks. Returns whether they were legal. */
  choose(relic: number, stairs: number): boolean;
  floorOver(): boolean;
  cleared(): boolean;
  fallen(): boolean;
  tick(): number;
  torch(): number;
  x(): number;
  y(): number;
  hp(): number;
  maxHp(): number;
  score(): number;
  gold(): number;
  slain(): number;
  floor(): number;
  stairs(): number;
  owned(): number;
  hasKey(): boolean;
  guarded(): boolean;
  /** Bit n set: the player has walked into room n. */
  seen(): number;
  tile(x: number, y: number): number;
  item(x: number, y: number): number;
  monsters(room: number): Monster[];
  /** Score of a whole run, or null if any floor is illegal. */
  replay(floors: LockedLap[]): number | null;
};

type Exports = {
  memory: WebAssembly.Memory;
  dn_new(hi: number, lo: number): void;
  dn_descend(hi: number, lo: number): void;
  dn_step(dir: number): number;
  dn_step_ok(dir: number): number;
  dn_choose(relic: number, stairs: number): number;
  dn_floor_over(): number;
  dn_cleared(): number;
  dn_fallen(): number;
  dn_tick(): number;
  dn_torch(): number;
  dn_x(): number;
  dn_y(): number;
  dn_hp(): number;
  dn_max_hp(): number;
  dn_score(): number;
  dn_gold(): number;
  dn_slain(): number;
  dn_floor(): number;
  dn_stairs(): number;
  dn_owned(): number;
  dn_has_key(): number;
  dn_guarded(): number;
  dn_seen(): number;
  dn_cell(x: number, y: number): number;
  dn_monster_count(room: number): number;
  dn_monster(room: number, slot: number): number;
  buffer_ptr(): number;
  replay_run(len: number): number;
};

function halves(seed: bigint): [number, number] {
  const value = BigInt.asUintN(64, seed);
  return [Number(value >> 32n), Number(value & 0xffff_ffffn)];
}

const WASM_URL = '/games/depths.wasm';
let cached: Promise<Depths> | null = null;

/** Loads the wasm once per page. Pass bytes to load it outside a browser. */
export function loadDepths(bytes?: BufferSource): Promise<Depths> {
  if (!bytes && cached) return cached;
  const task = (async () => {
    const source = bytes ?? (await (await fetch(WASM_URL)).arrayBuffer());
    const { instance } = await WebAssembly.instantiate(source, {});
    const api = instance.exports as unknown as Exports;
    return {
      start: (seed) => api.dn_new(...halves(seed)),
      descend: (seed) => api.dn_descend(...halves(seed)),
      step: (dir) => api.dn_step(dir == null ? 255 : dir) === 1,
      stepOk: (dir) => api.dn_step_ok(dir) === 1,
      choose: (relic, stairs) => api.dn_choose(relic, stairs) === 1,
      floorOver: () => api.dn_floor_over() === 1,
      cleared: () => api.dn_cleared() === 1,
      fallen: () => api.dn_fallen() === 1,
      tick: () => api.dn_tick(),
      torch: () => api.dn_torch(),
      x: () => api.dn_x(),
      y: () => api.dn_y(),
      hp: () => api.dn_hp(),
      maxHp: () => api.dn_max_hp(),
      score: () => api.dn_score(),
      gold: () => api.dn_gold(),
      slain: () => api.dn_slain(),
      floor: () => api.dn_floor(),
      stairs: () => api.dn_stairs(),
      owned: () => api.dn_owned(),
      hasKey: () => api.dn_has_key() === 1,
      guarded: () => api.dn_guarded() === 1,
      seen: () => api.dn_seen(),
      tile: (x, y) => api.dn_cell(x, y) & 0xf,
      item: (x, y) => api.dn_cell(x, y) >> 4,
      monsters(room) {
        const out: Monster[] = [];
        const count = api.dn_monster_count(room);
        for (let slot = 0; slot < count; slot += 1) {
          const packed = api.dn_monster(room, slot) >>> 0;
          out.push({ x: packed & 0xff, y: (packed >> 8) & 0xff, kind: (packed >> 16) & 0xf, placed: ((packed >> 20) & 1) === 1, hp: packed >>> 24 });
        }
        return out;
      },
      replay(floors) {
        const raw = encodeRun(floors);
        const limit = 1 + DEPTHS.FLOORS * (10 + DEPTHS.MAX_EVENTS * DEPTHS.EVENT_LEN + 2);
        if (floors.length === 0 || floors.length > DEPTHS.FLOORS || raw.length > limit) return null;
        // buffer_ptr may grow memory on first use, which detaches any earlier view of the buffer.
        const ptr = api.buffer_ptr();
        new Uint8Array(api.memory.buffer, ptr, raw.length).set(raw);
        const score = api.replay_run(raw.length);
        return score < 0 ? null : score;
      },
    } satisfies Depths;
  })();
  if (!bytes) {
    cached = task;
    task.catch(() => {
      cached = null;
    });
  }
  return task;
}

/** The picks at the end of a cleared floor's bytes, or nulls. */
export function picksOf(bytes: Uint8Array): { relic: number | null; stairs: number | null } {
  if (bytes.length % DEPTHS.EVENT_LEN === 0) return { relic: null, stairs: null };
  return { relic: bytes[bytes.length - 2]!, stairs: bytes[bytes.length - 1]! };
}

/** Puts the run where the next floor starts: replays the locked floors and their picks, then builds the new floor. */
export function restore(runner: Depths, floors: LockedLap[], seed: bigint) {
  runner.start(floors[0]?.seed ?? seed);
  floors.forEach((floor, k) => {
    if (k > 0) runner.descend(floor.seed);
    const count = Math.floor(floor.bytes.length / DEPTHS.EVENT_LEN);
    let cursor = 0;
    while (!runner.floorOver()) {
      const at = cursor * DEPTHS.EVENT_LEN;
      if (cursor < count && (floor.bytes[at]! | (floor.bytes[at + 1]! << 8)) === runner.tick()) {
        runner.step(floor.bytes[at + 2]!);
        cursor += 1;
      } else {
        runner.step(null);
      }
    }
    const { relic, stairs } = picksOf(floor.bytes);
    if (runner.cleared() && relic != null && stairs != null) runner.choose(relic, stairs);
  });
  if (floors.length > 0) runner.descend(seed);
}

/** Records steps as `tick u16 LE ‖ direction u8`, the format the game script reads. */
export class StepRecorder {
  private bytes: number[] = [];

  record(tick: number, dir: number) {
    if (this.bytes.length >= DEPTHS.MAX_EVENTS * DEPTHS.EVENT_LEN) return false;
    this.bytes.push(tick & 0xff, (tick >> 8) & 0xff, dir);
    return true;
  }

  moves(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** The relics a run holds and the stairs it is on, after these floors. */
export function runState(floors: Uint8Array[]): { owned: number; stairs: number } {
  let owned = 0;
  let stairs = SAFE;
  for (const bytes of floors) {
    const picks = picksOf(bytes);
    if (picks.relic != null) owned |= 1 << picks.relic;
    if (picks.stairs != null) stairs = picks.stairs;
  }
  return { owned, stairs };
}

/** What a run locked in and then ended before using, or null. */
export function unusedPicks(floors: Uint8Array[]): string | null {
  const last = floors.at(-1);
  if (!last || floors.length >= DEPTHS.FLOORS) return null;
  const { relic, stairs } = picksOf(last);
  if (relic == null || stairs == null) return null;
  return `Picked but never used: ${RELICS[relic]?.name ?? 'an item'}, ${stairs === DEEP ? 'deep stairs' : 'safe stairs'}.`;
}
