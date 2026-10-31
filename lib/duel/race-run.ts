/**
 * This browser's race in a duel: every lap it has sealed (the block that seeded it, and its moves).
 * Handing the run in needs the moves, which only this browser has, so they are kept across reloads.
 */

export type RaceLapRecord = { block: string; tape: string; score: number; crashed: boolean };
export type RaceRun = { laps: RaceLapRecord[]; handedIn: boolean };

const key = (duelId: string) => `crowns-race-run:${duelId.toLowerCase()}`;
const memory = new Map<string, RaceRun>();

export function loadRaceRun(duelId: string): RaceRun {
  try {
    const raw = window.localStorage.getItem(key(duelId));
    if (raw) return JSON.parse(raw) as RaceRun;
  } catch {
    // Fall back to this page's copy.
  }
  return memory.get(key(duelId)) ?? { laps: [], handedIn: false };
}

export function saveRaceRun(duelId: string, run: RaceRun) {
  memory.set(key(duelId), run);
  try {
    window.localStorage.setItem(key(duelId), JSON.stringify(run));
  } catch {
    // Storage unavailable: the run lasts as long as the page.
  }
}
