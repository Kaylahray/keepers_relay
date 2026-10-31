/**
 * The session key this browser plays a duel with: it signs every shot and race lap, so the wallet
 * only pops up to stake. Kept per duel, in this browser only, like a Crowns run's key. Losing it
 * means this browser can no longer move in that duel (the opponent can then claim it on time).
 */

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
