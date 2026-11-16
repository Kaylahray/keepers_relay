/** Crown Rally, as phones and the relay run it: the same Rust rules the game script runs on chain, compiled to wasm (`scripts/sudden-death/rally-wasm`). No browser or Next imports, so the relay can load it too. */

export const RALLY = {
  TICK_HZ: 20,
  TICK_MS: 50,
  LAPS: 3,
  MAX_TICKS: 120 * 20,
  MAX_CARS: 5,
  MAX_EVENTS: 800,
  EVENT_LEN: 3,
  ANGLES: 1024,
  SCALE: 64,
  HALF_WIDTH: 55 * 64,
  WALL: 85 * 64,
  CAR_RADIUS: 11 * 64,
  MAX_SPEED: 6 * 64,
  BOOSTS: 3,
  MAX_HP: 100,
} as const;

export const LEFT = 1;
export const RIGHT = 2;
export const BOOST = 4;
export const BRAKE = 8;
/** Fires the item the car holds. */
export const USE = 16;

/** The items, by the number the rules know them by, with how each looks on screen. 0 is empty hands. */
export const ITEMS = [
  null,
  { name: 'Ram', color: '#ff8a3d', about: 'Dash into the car ahead: it loses 30 health and is shoved aside.' },
  { name: 'Slick', color: '#9b6bff', about: 'Drop a patch behind you: a car on it loses half its speed and can’t steer for a moment.' },
  { name: 'Jolt', color: '#3ad8ff', about: 'Zap a car ahead: 30 damage, a third of its speed, and it can’t steer for a moment.' },
  { name: 'Barricade', color: '#ffb020', about: 'Drop a block behind you: the first car to hit it bounces off and loses 20 health.' },
  { name: 'Crown Rush', color: '#99ee2d', about: 'A one-second burst of speed, faster than a boost.' },
  { name: 'Ward', color: '#ff56f6', about: 'Blocks the next item that hits you, for 8 seconds.' },
  { name: 'Patch', color: '#2ee6a8', about: '40 health back.' },
  { name: 'Draft', color: '#406aff', about: 'Faster for 4 seconds while close behind a car.' },
] as const;
export type ItemInfo = NonNullable<(typeof ITEMS)[number]>;
export const SLICK_ITEM = 2;
export const BARRICADE_ITEM = 4;
/** Set on a car's result once it has finished every lap. */
export const FINISHED = 0x80;

/** The named maps, by the number the rally game knows them by. */
export const MAPS = [
  { id: 0, name: 'Harbour Loop', about: 'Long straights along the quay, square corners and a quick jink. The fast one.' },
  { id: 1, name: 'Switchback Hill', about: 'Up the hill on tight hairpins, then a long sweep back down. The slow one.' },
  { id: 2, name: 'Old Town', about: 'Narrow streets round the blocks, with a right angle at nearly every turn.' },
] as const;

export function mapName(id: number): string {
  return MAPS.find((map) => map.id === id)?.name ?? `Map ${id}`;
}

type Exports = {
  memory: WebAssembly.Memory;
  rl_new(slot: number, hi: number, lo: number, cars: number): void;
  rl_new_map(slot: number, map: number, cars: number): number;
  rl_maps(): number;
  rl_copy(from: number, to: number): void;
  rl_step(slot: number, packed: number, fifth: number): void;
  rl_tick(slot: number): number;
  rl_over(slot: number): number;
  rl_count(slot: number): number;
  rl_x(slot: number, car: number): number;
  rl_y(slot: number, car: number): number;
  rl_heading(slot: number, car: number): number;
  rl_speed(slot: number, car: number): number;
  rl_lap(slot: number, car: number): number;
  rl_boosts(slot: number, car: number): number;
  rl_boosting(slot: number, car: number): number;
  rl_hp(slot: number, car: number): number;
  rl_item(slot: number, car: number): number;
  rl_shards(slot: number, car: number): number;
  rl_effects(slot: number, car: number): number;
  rl_pads(): number;
  rl_pad_x(slot: number, pad: number): number;
  rl_pad_y(slot: number, pad: number): number;
  rl_pad_item(slot: number, pad: number): number;
  rl_hazards(): number;
  rl_hazard_kind(slot: number, h: number): number;
  rl_hazard_x(slot: number, h: number): number;
  rl_hazard_y(slot: number, h: number): number;
  rl_wreck(slot: number, car: number): number;
  rl_ghost(slot: number, car: number): number;
  rl_finished(slot: number, car: number): number;
  rl_place(slot: number, car: number): number;
  rl_progress(slot: number, car: number): number;
  rl_bot(slot: number, car: number): number;
  rl_track_x(slot: number, point: number): number;
  rl_track_y(slot: number, point: number): number;
  rl_track_len(slot: number): number;
  buffer_ptr(): number;
  replay_race(len: number): number;
};

/** A pad on the road: where, its item, and whether a car has just emptied it. */
export type PadView = { x: number; y: number; item: number; empty: boolean };
/** A Slick or Barricade on the road. */
export type HazardView = { kind: number; x: number; y: number };

export type CarView = {
  x: number;
  y: number;
  /** Radians, drawn with y pointing down. */
  angle: number;
  speed: number;
  lap: number;
  boosts: number;
  boosting: boolean;
  /** Health, out of `RALLY.MAX_HP`. */
  hp: number;
  /** Sitting still after a wreck. */
  wrecked: boolean;
  /** Just back from a wreck, passing through other cars. */
  ghost: boolean;
  /** The item it holds, an index into `ITEMS`, or 0. */
  item: number;
  shards: number;
  ramming: boolean;
  rushing: boolean;
  warded: boolean;
  drafting: boolean;
  slipping: boolean;
  /** The tick it crossed the line, or null. */
  finished: number | null;
  place: number;
  progress: number;
};

/** Slot 0 is the race everyone agrees on; slot 1 is for guessing ahead. */
export type Slot = 0 | 1;

export type RallyRunner = {
  /** A race on a named map. */
  start(slot: Slot, map: number, cars: number): void;
  /** A race on any road, for practice. */
  startSeed(slot: Slot, seed: bigint, cars: number): void;
  copy(from: Slot, to: Slot): void;
  /** One tick with each car's input. */
  step(slot: Slot, inputs: number[]): void;
  tick(slot: Slot): number;
  over(slot: Slot): boolean;
  count(slot: Slot): number;
  car(slot: Slot, i: number): CarView;
  bot(slot: Slot, i: number): number;
  pads(slot: Slot): PadView[];
  /** The Slicks and Barricades down now. */
  hazards(slot: Slot): HazardView[];
  /** The road's middle line, in position units. */
  track(slot: Slot): { x: number; y: number }[];
  /** Replays a whole record (`map ‖ cars ‖ tapes`) into slot 1. Returns each car's result, or null for an illegal record. */
  replay(record: Uint8Array): number[] | null;
};

function effectsOf(bits: number) {
  return { ramming: (bits & 1) !== 0, rushing: (bits & 2) !== 0, warded: (bits & 4) !== 0, drafting: (bits & 8) !== 0, slipping: (bits & 16) !== 0 };
}

function halves(seed: bigint): [number, number] {
  const value = BigInt.asUintN(64, seed);
  return [Number(value >> 32n), Number(value & 0xffff_ffffn)];
}

const WASM_URL = '/games/rally.wasm';
let compiled: Promise<WebAssembly.Module> | null = null;

/**
 * A fresh rally runner, with its own wasm memory, so the relay can run many races at once. Pass the
 * wasm bytes to load it outside a browser.
 */
export async function loadRally(bytes?: BufferSource): Promise<RallyRunner> {
  let code: WebAssembly.Module;
  if (bytes) {
    code = await WebAssembly.compile(bytes);
  } else {
    compiled ??= fetch(WASM_URL)
      .then((response) => response.arrayBuffer())
      .then((raw) => WebAssembly.compile(raw));
    compiled.catch(() => {
      compiled = null;
    });
    code = await compiled;
  }
  const instance = await WebAssembly.instantiate(code, {});
  const api = instance.exports as unknown as Exports;
  return {
    start(slot, map, cars) {
      if (api.rl_new_map(slot, map, cars) !== 1) throw new Error(`There is no map ${map}.`);
    },
    startSeed: (slot, seed, cars) => api.rl_new(slot, ...halves(seed), cars),
    copy: (from, to) => api.rl_copy(from, to),
    step: (slot, inputs) => api.rl_step(slot, ((inputs[0] ?? 0) | ((inputs[1] ?? 0) << 8) | ((inputs[2] ?? 0) << 16) | ((inputs[3] ?? 0) << 24)) >>> 0, inputs[4] ?? 0),
    tick: (slot) => api.rl_tick(slot),
    over: (slot) => api.rl_over(slot) === 1,
    count: (slot) => api.rl_count(slot),
    car(slot, i) {
      const finished = api.rl_finished(slot, i);
      return {
        x: api.rl_x(slot, i),
        y: api.rl_y(slot, i),
        angle: (api.rl_heading(slot, i) / RALLY.ANGLES) * Math.PI * 2,
        speed: api.rl_speed(slot, i),
        lap: api.rl_lap(slot, i),
        boosts: api.rl_boosts(slot, i),
        boosting: api.rl_boosting(slot, i) === 1,
        hp: api.rl_hp(slot, i),
        wrecked: api.rl_wreck(slot, i) > 0,
        ghost: api.rl_ghost(slot, i) > 0,
        item: api.rl_item(slot, i),
        shards: api.rl_shards(slot, i),
        ...effectsOf(api.rl_effects(slot, i)),
        finished: finished < 0 ? null : finished,
        place: api.rl_place(slot, i),
        progress: api.rl_progress(slot, i),
      };
    },
    bot: (slot, i) => api.rl_bot(slot, i),
    pads(slot) {
      return Array.from({ length: api.rl_pads() }, (_, pad) => {
        const item = api.rl_pad_item(slot, pad);
        return { x: api.rl_pad_x(slot, pad), y: api.rl_pad_y(slot, pad), item: item & 0x7f, empty: (item & 0x80) !== 0 };
      }).filter((pad) => pad.item !== 0);
    },
    hazards(slot) {
      return Array.from({ length: api.rl_hazards() }, (_, h) => ({ kind: api.rl_hazard_kind(slot, h), x: api.rl_hazard_x(slot, h), y: api.rl_hazard_y(slot, h) })).filter((hazard) => hazard.kind !== 0);
    },
    track(slot) {
      return Array.from({ length: api.rl_track_len(slot) }, (_, point) => ({ x: api.rl_track_x(slot, point), y: api.rl_track_y(slot, point) }));
    },
    replay(record) {
      const limit = 2 + RALLY.MAX_CARS * (2 + RALLY.MAX_EVENTS * RALLY.EVENT_LEN);
      if (record.length > limit) return null;
      // buffer_ptr may grow memory on first use, which detaches any earlier view of the buffer.
      const ptr = api.buffer_ptr();
      new Uint8Array(api.memory.buffer, ptr, record.length).set(record);
      const count = api.replay_race(record.length);
      if (count < 0) return null;
      return Array.from({ length: count }, (_, i) => resultOf(api.rl_place(1, i), api.rl_finished(1, i) >= 0));
    },
  };
}

/** What the game script says about a car: its place, with `FINISHED` set if it finished. */
export function resultOf(place: number, finished: boolean): number {
  return place | (finished ? FINISHED : 0);
}

/** Each car's result at the end of a race in `slot`. */
export function resultsOf(runner: RallyRunner, slot: Slot): number[] {
  return Array.from({ length: runner.count(slot) }, (_, i) => {
    const car = runner.car(slot, i);
    return resultOf(car.place, car.finished != null);
  });
}

/** The cars that won: first and finished. Two cars over the line on the same tick share it. */
export function winnersOf(results: number[]): number[] {
  return results.flatMap((result, car) => (result === FINISHED ? [car] : []));
}

/** One car's input change: from `tick` on, the car holds `bits`. */
export type RallyEvent = { tick: number; bits: number };

/** A car's events as the chain reads them: `tick u16 LE ‖ input u8`. */
export function encodeTape(events: RallyEvent[]): Uint8Array {
  const out = new Uint8Array(events.length * RALLY.EVENT_LEN);
  events.forEach((event, i) => {
    out[i * 3] = event.tick & 0xff;
    out[i * 3 + 1] = (event.tick >> 8) & 0xff;
    out[i * 3 + 2] = event.bits;
  });
  return out;
}

/** One car's moves as its phone signs them and the game reads them: `count u16 LE ‖ events`. */
export function encodeMoves(events: RallyEvent[]): Uint8Array {
  return Uint8Array.from([events.length & 0xff, (events.length >> 8) & 0xff, ...encodeTape(events)]);
}

/** The race as the game reads it, without its map: `cars u8 ‖ per car: count u16 LE ‖ events`. */
export function encodeRecord(tapes: RallyEvent[][]): Uint8Array {
  const parts: number[] = [tapes.length];
  for (const events of tapes) parts.push(...encodeMoves(events));
  return Uint8Array.from(parts);
}

/** Plays a race forward from its events, to `upTo` ticks or its end. Used to catch up and to replay. */
export function playTo(runner: RallyRunner, slot: Slot, tapes: RallyEvent[][], upTo: number, held: number[] = [], next: number[] = []) {
  while (runner.tick(slot) < upTo && !runner.over(slot)) {
    const tick = runner.tick(slot);
    tapes.forEach((events, car) => {
      const at = next[car] ?? 0;
      if (events[at]?.tick === tick) {
        held[car] = events[at]!.bits;
        next[car] = at + 1;
      }
    });
    runner.step(slot, held);
  }
}
