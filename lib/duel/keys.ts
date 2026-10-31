/** The session key this browser plays a duel with: it signs every shot and race lap, so the wallet only pops up to stake. */

const KEY = 'crowns-duel-keys';

type Saved = Record<string, string>;

function readAll(): Saved {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
}

export function saveDuelKey(duelId: string, secret: string) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [duelId.toLowerCase()]: secret }));
  } catch {
    // Storage unavailable: the key lasts as long as the page.
  }
}

export function loadDuelKey(duelId: string): `0x${string}` | null {
  return (readAll()[duelId.toLowerCase()] as `0x${string}` | undefined) ?? null;
}

export function forgetDuelKey(duelId: string) {
  const all = readAll();
  delete all[duelId.toLowerCase()];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Nothing to forget.
  }
}

const PENDING = 'crowns-duel-pending-keys';

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
