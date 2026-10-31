'use client';

import { useEffect, useState } from 'react';

/** Wall-clock time, ticking while `active`, for turn timers. */
export function useTick(active: boolean, everyMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [active, everyMs]);
  return now;
}
