/** This browser's run in a crown: the session key that locks its laps, and every lap locked so far. */

export type SealedLapRecord = {
  /** The block the lap was seeded by (hex). */
  block: string;
  /** The lap's moves and picks (hex). */
  tape: string;
  /** The run's score at the end of this lap. */
  score: number;
  /** The run crashed in this lap, so it ends here. */
  crashed: boolean;
  coins?: number;
};

/** A lap driven but not locked yet, kept so a reload can't lose it or drive it again. */
export type DrivenLapRecord = {
  /** Its index from zero. */
  lap: number;
  /** The lap's moves (hex). */
  moves: string;
  score: number;
  coins: number;
  crashed: boolean;
  /** Set once the picks are made, so a failed lock can be sent again without choosing again. */
  picks?: { upgrade: number | null; road: number | null };
};

export type LapRun = {
  /** The session key's secret (hex). It can only lock laps into this one entry. */
  session: string;
  laps: SealedLapRecord[];
  driven?: DrivenLapRecord | null;
  /** The transaction holding this run's entry right now; a lap read from any other entry is ignored. */
  entryTx?: string;
  /** When the last lap was locked, for the wait's timer. */
  sealedAt?: number;
  /** The run ended: it took the crown, or crashed and was left there. */
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

/** Every run this browser keeps for one wallet, by crown. */
export function savedLapRuns(address: string): { roomId: string; run: LapRun }[] {
  const end = `:${address.trim().toLowerCase()}`;
  const runs: { roomId: string; run: LapRun }[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const slot = window.localStorage.key(index);
      if (!slot?.startsWith('crowns-lap-run:') || !slot.endsWith(end)) continue;
      const raw = window.localStorage.getItem(slot);
      if (raw) runs.push({ roomId: slot.slice('crowns-lap-run:'.length, -end.length), run: JSON.parse(raw) as LapRun });
    }
  } catch {
    // Storage unavailable: nothing saved to look through.
  }
  return runs;
}

/** A run key a new entry replaced before its key cell came back. Kept so the cell can still be returned. */
export type OldRunKey = { session: string; address: string; since: number };

const OLD_KEYS = 'crowns-old-run-keys';

function readOldKeys(): OldRunKey[] {
  try {
    return JSON.parse(window.localStorage.getItem(OLD_KEYS) ?? '[]') as OldRunKey[];
  } catch {
    return [];
  }
}

function writeOldKeys(keys: OldRunKey[]): void {
  try {
    window.localStorage.setItem(OLD_KEYS, JSON.stringify(keys));
  } catch {
    // Storage unavailable: the key is lost with the page, as before.
  }
}

export function keepOldRunKey(address: string, session: string): void {
  const keys = readOldKeys().filter((key) => key.session !== session);
  writeOldKeys([...keys, { session, address: address.trim().toLowerCase(), since: Date.now() }]);
}

export function oldRunKeys(address: string): OldRunKey[] {
  return readOldKeys().filter((key) => key.address === address.trim().toLowerCase());
}

export function dropOldRunKey(session: string): void {
  writeOldKeys(readOldKeys().filter((key) => key.session !== session));
}
