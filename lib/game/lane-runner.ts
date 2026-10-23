/**
 * The lane runner, as the browser runs it: the same Rust rules the game script runs on chain,
 * compiled to wasm (`scripts/sudden-death/game-wasm`). Whatever score this reports for a tape is
 * the score the chain will compute, which is what lets a player know before they pay whether
 * their run takes the crown.
 */

export const LANE = {
  TICK_HZ: 30,
  MAX_TICKS: 30 * 120,
  LANES: 3,
  LANE_W: 1000,
  VIEW_DEPTH: 6000,
  EVENT_LEN: 3,
  MAX_EVENTS: 4096,
} as const;

/** Served from `public/`. Rebuild with `cargo build --release --target wasm32-unknown-unknown` in game-wasm. */
export const LANE_RUNNER_WASM_URL = '/games/lane-runner.wasm';

export type LaneRow = {
  /** Distance from the player. 0 is the player's line, VIEW_DEPTH the horizon. */
  y: number;
  /** Bit n set: lane n is blocked. */
  blocked: number;
  /** Lane holding a coin, or -1. */
  coin: number;
};

export type LaneRunner = {
  /** Starts a fresh run on a course. One live run per loaded instance. */
  start(seed: bigint): void;
  /** One tick. `lane` is this tick's input, or null for none. */
  step(lane: number | null): void;
  over(): boolean;
  tick(): number;
  /** Player position, 0 (left lane centre) to 2000 (right lane centre). */
  x(): number;
  score(): number;
  rows(): LaneRow[];
  /** Score of a whole tape on a course, or null if the tape is illegal. */
  replay(seed: bigint, tape: Uint8Array): number | null;
};

type Exports = {
  memory: WebAssembly.Memory;
  run_new(hi: number, lo: number): void;
  run_step(lane: number): void;
  run_over(): number;
  run_tick(): number;
  run_x(): number;
  run_score(): number;
  run_row_count(): number;
  run_row(index: number): number;
  tape_ptr(): number;
  replay(hi: number, lo: number, len: number): number;
};

function halves(seed: bigint): [number, number] {
  const value = BigInt.asUintN(64, seed);
  return [Number(value >> 32n), Number(value & 0xffff_ffffn)];
}

let cached: Promise<LaneRunner> | null = null;

/** Loads the wasm once per page. Pass bytes to load it outside a browser. */
export function loadLaneRunner(bytes?: BufferSource): Promise<LaneRunner> {
  if (!bytes && cached) return cached;
  const task = (async () => {
    const source = bytes ?? (await (await fetch(LANE_RUNNER_WASM_URL)).arrayBuffer());
    const { instance } = await WebAssembly.instantiate(source, {});
    const api = instance.exports as unknown as Exports;
    return {
      start(seed) {
        api.run_new(...halves(seed));
      },
      step(lane) {
        api.run_step(lane == null ? 255 : lane);
      },
      over: () => api.run_over() === 1,
      tick: () => api.run_tick(),
      x: () => api.run_x(),
      score: () => api.run_score(),
      rows() {
        const count = api.run_row_count();
        const rows: LaneRow[] = [];
        for (let i = 0; i < count; i += 1) {
          const packed = api.run_row(i);
          rows.push({ y: packed >> 8, blocked: packed & 0xf, coin: ((packed >> 4) & 0xf) - 1 });
        }
        return rows;
      },
      replay(seed, tape) {
        if (tape.length > LANE.MAX_EVENTS * LANE.EVENT_LEN) return null;
        // tape_ptr may grow memory on first use, which detaches any earlier view of the buffer.
        const ptr = api.tape_ptr();
        new Uint8Array(api.memory.buffer, ptr, tape.length).set(tape);
        const score = api.replay(...halves(seed), tape.length);
        return score < 0 ? null : score;
      },
    } satisfies LaneRunner;
  })();
  if (!bytes) {
    cached = task;
    task.catch(() => {
      cached = null;
    });
  }
  return task;
}

/** Records lane changes as `tick u16 LE ‖ lane u8`, the tape format the game script reads. */
export class TapeRecorder {
  private bytes: number[] = [];

  /** Records `lane` at `tick` if it changes the target. Returns whether it was recorded. */
  record(tick: number, lane: number, current: number): boolean {
    if (lane === current || this.bytes.length >= LANE.MAX_EVENTS * LANE.EVENT_LEN) return false;
    this.bytes.push(tick & 0xff, (tick >> 8) & 0xff, lane);
    return true;
  }

  tape(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}
