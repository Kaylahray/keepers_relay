/**
 * Simple in-memory sliding-window rate limit (per isolate).
 * Keyed by client IP + route bucket — good enough for single-node / edge isolates.
 */

import { ApiError } from '@/lib/server/errors';

const hits = new Map<string, number[]>();

function clientIp(request: Request): string {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export const RATE = {
  /** General event writes (create/join/answer/…). */
  eventsWrite: { limit: 30, windowMs: 60_000 },
  /** Auth challenge + verify. */
  auth: { limit: 5, windowMs: 60_000 },
  /** Reward auto-issue. */
  autoIssue: { limit: 3, windowMs: 60_000 },
  /** AI question preview. */
  generateQuestions: { limit: 10, windowMs: 60_000 },
} as const;

/** Throw ApiError 429 when the sliding window is exceeded. */
export function rateLimitOrThrow(
  request: Request,
  routeKey: string,
  limit: number,
  windowMs = 60_000,
): void {
  const now = Date.now();
  const key = `${clientIp(request)}:${routeKey}`;
  const windowStart = now - windowMs;
  const prev = hits.get(key) ?? [];
  const recent = prev.filter((t) => t > windowStart);
  if (recent.length >= limit) {
    throw new ApiError('Too many requests. Slow down and try again.', 429);
  }
  recent.push(now);
  hits.set(key, recent);

  // Bound map growth on long-lived isolates
  if (hits.size > 5_000) {
    for (const [k, ts] of hits) {
      const kept = ts.filter((t) => t > windowStart);
      if (kept.length === 0) hits.delete(k);
      else hits.set(k, kept);
    }
  }
}
