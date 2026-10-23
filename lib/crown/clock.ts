/**
 * One clock for everybody.
 *
 * A deadline is an absolute millisecond timestamp written into the match cell, so every screen
 * can count down to it without talking to anyone. That only holds while the screens agree on
 * what time it is now. A phone whose clock is three minutes fast shows three minutes less of
 * the same match, answers "too late" while the round is still open, and looks — to the person
 * holding it — exactly like the game being broken.
 *
 * The lobby poll carries the server's clock. Every reply corrects this offset, so `nowMs()` is
 * the shared wall clock rather than this device's opinion of it.
 */
let skewMs = 0;

/** Fold a lobby reply into the offset. `sentAt` is when this browser made the request. */
export function noteServerTime(serverNow: number, sentAt: number): void {
  if (!Number.isFinite(serverNow) || serverNow <= 0) return;
  // The reply spent about half the round trip in flight, so the server's clock has moved on
  // by that much since it stamped the response.
  const roundTrip = Date.now() - sentAt;
  if (roundTrip < 0 || roundTrip > 10_000) return;
  skewMs = serverNow + roundTrip / 2 - Date.now();
}

/** Now, on the clock the whole lobby shares. */
export function nowMs(): number {
  return Date.now() + skewMs;
}
