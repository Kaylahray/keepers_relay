/**
 * This browser's best run on a course, kept across navigation and refreshes. A run is only worth
 * anything on the course it was played on, so it is keyed by crown and seed. Browser storage can
 * be unavailable (private windows, blocked storage); then runs simply last as long as the page.
 */

export type StoredRun = { tape: Uint8Array; score: number; seed: bigint };

const key = (roomId: string, seed: bigint) => `crowns-best-run:${roomId}:${seed.toString(16)}`;

export function loadBestRun(roomId: string, seed: bigint): StoredRun | null {
  try {
    const raw = window.localStorage.getItem(key(roomId, seed));
    if (!raw) return null;
    const { tape, score } = JSON.parse(raw) as { tape: string; score: number };
    const bytes = new Uint8Array(tape.length / 2);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(tape.slice(i * 2, i * 2 + 2), 16);
    return { tape: bytes, score, seed };
  } catch {
    return null;
  }
}

export function saveBestRun(roomId: string, run: StoredRun): void {
  try {
    const tape = [...run.tape].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    window.localStorage.setItem(key(roomId, run.seed), JSON.stringify({ tape, score: run.score }));
  } catch {
    // Storage unavailable: the run still lives for this page.
  }
}

export function forgetBestRun(roomId: string, seed: bigint): void {
  try {
    window.localStorage.removeItem(key(roomId, seed));
  } catch {
    // Nothing to forget.
  }
}
