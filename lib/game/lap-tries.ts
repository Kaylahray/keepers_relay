import { bytesToHex, hexToBytes } from '@/lib/sudden-death/codec';

/** Tries a player gets at each lap: the first drive and one retry. The app holds this limit; the chain only sees what gets sealed. */
export const LAP_TRIES = 2;
/** A try this close to the end of the seal window could not be sealed in time, so none starts. */
export const TRY_NEEDS_MS = 45_000;
/** A seal sent this close to the end of its window might land after it, so the page counts down to this margin. */
export const SEAL_MARGIN_MS = 15_000;
/** The warning to seal shows with this long left. */
export const SEAL_WARNING_MS = 30_000;

export type SavedTry = { tape: string; score: number; crashed: boolean };
export type LapTries = { lap: number; used: number; clean: SavedTry | null; crash: SavedTry | null };

const slot = (scope: string) => `crowns-lap-tries:${scope}`;
const memory = new Map<string, LapTries>();

export function loadLapTries(scope: string): LapTries | null {
  try {
    const raw = window.localStorage.getItem(slot(scope));
    if (raw) return JSON.parse(raw) as LapTries;
  } catch {
    // Fall back to this page's copy.
  }
  return memory.get(scope) ?? null;
}

export function saveLapTries(scope: string, tries: LapTries | null): void {
  if (tries) memory.set(scope, tries);
  else memory.delete(scope);
  try {
    if (tries) window.localStorage.setItem(slot(scope), JSON.stringify(tries));
    else window.localStorage.removeItem(slot(scope));
  } catch {
    // Storage unavailable: the tries still live for this page.
  }
}

/** One more finished try at a lap: keeps the best clean one, and a crash only when it scored higher. */
export function addTry(current: LapTries | null, lap: number, run: { tape: Uint8Array; score: number; crashed: boolean }): LapTries {
  const base = current?.lap === lap ? current : { lap, used: 0, clean: null, crash: null };
  const saved: SavedTry = { tape: bytesToHex(run.tape), score: run.score, crashed: run.crashed };
  let { clean, crash } = base;
  if (run.crashed) {
    if (!crash || run.score > crash.score) crash = saved;
  } else if (!clean || run.score > clean.score) {
    clean = saved;
  }
  if (crash && clean && crash.score <= clean.score) crash = null;
  return { lap, used: base.used + 1, clean, crash };
}

export function triesLeft(tries: LapTries | null, lap: number): number {
  return Math.max(0, LAP_TRIES - (tries?.lap === lap ? tries.used : 0));
}

export function tapeOf(saved: SavedTry): Uint8Array {
  return hexToBytes(saved.tape);
}
