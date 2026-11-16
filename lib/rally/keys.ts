/** The session key this browser races a match with: it signs the finish, so the wallet only pops up for the entry. */

// The storage names are the ones duels used, so keys saved before the cleanup are still found.
const KEY = 'crowns-duel-keys';
const PENDING = 'crowns-duel-pending-keys';

type Saved = Record<string, string>;

function readAll(): Saved {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
}

export function saveRallyKey(matchId: string, secret: string) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [matchId.toLowerCase()]: secret }));
  } catch {
    // Storage unavailable: the key lasts as long as the page.
  }
}

export function loadRallyKey(matchId: string): `0x${string}` | null {
  return (readAll()[matchId.toLowerCase()] as `0x${string}` | undefined) ?? null;
}

/** Every saved key, by match id. */
export function savedRallyKeys(): [string, `0x${string}`][] {
  return Object.entries(readAll()) as [string, `0x${string}`][];
}

export function forgetRallyKey(matchId: string) {
  const all = readAll();
  delete all[matchId.toLowerCase()];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Nothing to forget.
  }
}

/** Remembers a fresh session key before the wallet is asked to approve. */
export function rememberPendingKey(secret: string) {
  try {
    const list = JSON.parse(window.localStorage.getItem(PENDING) ?? '[]') as string[];
    if (!list.includes(secret)) list.push(secret);
    window.localStorage.setItem(PENDING, JSON.stringify(list.slice(-20)));
  } catch {
    // Storage unavailable: nothing to fall back on.
  }
}

export function pendingKeys(): `0x${string}`[] {
  try {
    return JSON.parse(window.localStorage.getItem(PENDING) ?? '[]') as `0x${string}`[];
  } catch {
    return [];
  }
}

export function forgetPendingKey(secret: string) {
  try {
    const list = pendingKeys().filter((key) => key !== secret);
    window.localStorage.setItem(PENDING, JSON.stringify(list));
  } catch {
    // Nothing to forget.
  }
}
