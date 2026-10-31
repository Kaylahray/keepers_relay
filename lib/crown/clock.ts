/** One clock for everybody. */
let skewMs = 0;

/** Fold a lobby reply into the offset. `sentAt` is when this browser made the request. */
export function noteServerTime(serverNow: number, sentAt: number): void {
  if (!Number.isFinite(serverNow) || serverNow <= 0) return;
  // The reply spent about half the round trip in flight, so the server's clock has moved on by that much since it stamped the response.
  const roundTrip = Date.now() - sentAt;
  if (roundTrip < 0 || roundTrip > 10_000) return;
  skewMs = serverNow + roundTrip / 2 - Date.now();
}

/** Now, on the clock the whole lobby shares. */
export function nowMs(): number {
  return Date.now() + skewMs;
}
