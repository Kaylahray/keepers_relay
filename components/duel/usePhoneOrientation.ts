'use client';

import { useSyncExternalStore } from 'react';

const PORTRAIT = '(pointer: coarse) and (orientation: portrait) and (max-width: 767px)';
const LANDSCAPE = '(pointer: coarse) and (orientation: landscape) and (max-height: 500px)';

function subscribe(onChange: () => void) {
  const queries = [window.matchMedia(PORTRAIT), window.matchMedia(LANDSCAPE)];
  queries.forEach((query) => query.addEventListener('change', onChange));
  return () => queries.forEach((query) => query.removeEventListener('change', onChange));
}

function read(): 'portrait' | 'landscape' | null {
  if (window.matchMedia(PORTRAIT).matches) return 'portrait';
  if (window.matchMedia(LANDSCAPE).matches) return 'landscape';
  return null;
}

/** On a phone, which way it is held; null on anything else (tablet, desktop), and on the server. */
export function usePhoneOrientation(): 'portrait' | 'landscape' | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
