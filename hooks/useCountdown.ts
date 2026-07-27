'use client';

import { useEffect, useState } from 'react';

export interface CountdownState {
  totalMs: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  /** 0 (fresh) → 1 (out of time), based on the full window. */
  fractionElapsed: number;
}

interface CountdownOptions {
  /** Full window length in ms, used to compute urgency fraction. */
  windowMs: number;
  /** Pause ticking (e.g. once the chain is dead). */
  paused?: boolean;
}

/**
 * Live countdown to an ISO deadline. Ticks every second on the client while
 * React Query owns the source of truth for whether the chain is actually dead.
 */
export function useCountdown(
  expiresAt: string | undefined,
  { windowMs, paused = false }: CountdownOptions,
): CountdownState {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (paused || !expiresAt) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [paused, expiresAt]);

  const deadline = expiresAt ? new Date(expiresAt).getTime() : now;
  const totalMs = Math.max(0, deadline - now);
  const isExpired = expiresAt ? deadline <= now : false;

  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const fractionElapsed = windowMs > 0 ? Math.min(1, Math.max(0, 1 - totalMs / windowMs)) : 0;

  return { totalMs, hours, minutes, seconds, isExpired, fractionElapsed };
}
