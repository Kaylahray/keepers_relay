'use client';

import { useEffect, useState } from 'react';

export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 40);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function leftMs(deadlineAt: number | null, now: number): number {
  if (deadlineAt == null) return 0;
  return Math.max(0, deadlineAt - now);
}

/** The face players read. A passed deadline stays open until the host closes. */
export function playClock(deadlineAt: number | null, now: number): { face: string; counting: boolean; caption: string } {
  if (deadlineAt == null) {
    return { face: '—', counting: false, caption: 'The host has not started the clock.' };
  }
  const left = deadlineAt - now;
  if (left <= 0) {
    return {
      face: 'Still open',
      counting: false,
      caption: 'The host may close and pay the king. A correct answer still takes the crown until that close lands.',
    };
  }
  return {
    face: formatLeft(left),
    counting: true,
    caption: 'Time left to play. A correct answer takes the crown while this counts down. At zero the host may close.',
  };
}

function formatLeft(ms: number): string {
  if (ms >= 60_000) {
    const secs = Math.floor(ms / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
  }
  return (ms / 1000).toFixed(2);
}

export function BleedingClock({
  deadlineAt,
  live,
  openingMs,
  plate,
}: {
  deadlineAt: number | null;
  live: boolean;
  openingMs: number;
  plate?: 'dark' | 'light';
}) {
  const now = useNow(live && deadlineAt != null);
  const left = leftMs(deadlineAt, now);
  const clock = playClock(deadlineAt, now);
  const panic = live && left > 0 && left <= 4_000;
  const width =
    deadlineAt == null ? 0 : Math.max(0, Math.min(100, (left / openingMs) * 100));
  const label = plate === 'dark' ? 'text-[#111]/60' : plate === 'light' ? 'text-white/70' : 'text-white/40';
  const number =
    plate === 'dark' ? 'text-[#111]' : plate === 'light' ? 'text-white' : panic ? 'text-[#af2a3a]' : 'text-[#99ee2d]';
  const track = plate === 'dark' ? 'bg-[#111]/15' : 'bg-white/15';
  const fill = plate === 'dark' ? 'bg-[#111]' : plate === 'light' ? 'bg-white' : panic ? 'bg-[#af2a3a]' : 'bg-[#99ee2d]';

  return (
    <div>
      <p className={`font-mono text-[10px] uppercase tracking-[0.18em] ${label}`}>
        {clock.counting ? 'Time left to play' : live ? 'Host may close' : 'Clock'}
      </p>
      <p className={`font-poster uppercase leading-none ${clock.counting ? 'text-7xl sm:text-8xl' : 'text-5xl sm:text-6xl'} ${number}`}>
        {clock.face}
      </p>
      <div className={`mt-3 h-2 ${track}`}>
        <div className={`h-full ${fill}`} style={{ width: `${width}%` }} />
      </div>
      <p className={`mt-2 font-mono text-[10px] uppercase ${label}`}>{clock.caption}</p>
    </div>
  );
}
