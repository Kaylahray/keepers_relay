/**
 * This browser's run in a crown: the session key that seals its laps, and every lap sealed so far.
 * The grab needs each lap's moves, which only this browser has, so they are kept across refreshes.
 * Keyed by crown and wallet. Browser storage can be unavailable (private windows, blocked storage);
 * then the run lasts as long as the page.
 */

export type SealedLapRecord = {
  /** The block the lap was seeded by (hex). */
  block: string;
  /** The lap's moves (hex). */
  tape: string;
  /** The run's score at the end of this lap. */
  score: number;
  /** The run crashed in this lap, so it ends here. */
  crashed: boolean;
};

export type LapRun = {
  /** The session key's secret (hex). It can only seal laps into this one entry. */
  session: string;
  laps: SealedLapRecord[];
  /** When the last seal was sent, for the pit stop's timer. */
  sealedAt?: number;
  /** The run was sent as a grab, so nothing more can be sealed into it. */
  finished?: boolean;
  /** The run can no longer be sent and its key cell went back to the player. */
  keyReturned?: boolean;
};

const key = (roomId: string, address: string) => `crowns-lap-run:${roomId}:${address.trim().toLowerCase()}`;
const memory = new Map<string, LapRun>();

export function loadLapRun(roomId: string, address: string): LapRun | null {
  const slot = key(roomId, address);
  try {
    const raw = window.localStorage.getItem(slot);
    if (raw) return JSON.parse(raw) as LapRun;
  } catch {
    // Fall back to this page's copy.
  }
  return memory.get(slot) ?? null;
}

export function saveLapRun(roomId: string, address: string, run: LapRun): void {
  const slot = key(roomId, address);
  memory.set(slot, run);
  try {
    window.localStorage.setItem(slot, JSON.stringify(run));
  } catch {
    // Storage unavailable: the run still lives for this page.
  }
}

export function forgetLapRun(roomId: string, address: string): void {
  const slot = key(roomId, address);
  memory.delete(slot);
  try {
    window.localStorage.removeItem(slot);
  } catch {
    // Nothing to forget.
  }
}
