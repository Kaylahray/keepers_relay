'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { CountdownState } from '@/hooks/useCountdown';

interface CountdownProps {
  countdown: CountdownState;
  dead: boolean;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function urgencyState(fractionElapsed: number, dead: boolean) {
  if (dead) return 'dead' as const;
  if (fractionElapsed >= 0.85) return 'critical' as const;
  if (fractionElapsed >= 0.6) return 'warning' as const;
  return 'safe' as const;
}

const COLOR: Record<string, string> = {
  safe: '#99ee2d',
  warning: '#e1bf47',
  critical: '#af2a3a',
  dead: '#666',
};

const LABEL: Record<string, string> = {
  safe: 'THE CELL LIVES',
  warning: 'THE CLOCK IS LOUD',
  critical: "DON'T BREAK IT",
  dead: 'CELL DEAD',
};

export function Countdown({ countdown, dead }: CountdownProps) {
  const state = urgencyState(countdown.fractionElapsed, dead);
  const color = COLOR[state];
  const segments: [number, string][] = [
    [countdown.hours, 'HRS'],
    [countdown.minutes, 'MIN'],
    [countdown.seconds, 'SEC'],
  ];

  return (
    <div className="border border-white/15 bg-black/40 p-4 text-white backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <p
          className="rounded px-2 py-1 text-[10px] font-bold tracking-[0.14em] text-white"
          style={{ backgroundColor: color }}
        >
          {LABEL[state]}
        </p>
        <p className="font-mono text-[10px] font-bold text-white/50">KEEPER WINDOW</p>
      </div>
      <motion.div
        className="mt-4 flex items-end justify-center gap-1.5 sm:gap-3"
        animate={state === 'critical' ? { x: [0, -2, 2, 0] } : {}}
        transition={{ duration: 0.45, repeat: Infinity }}
      >
        {segments.map(([value, unit], i) => (
          <React.Fragment key={unit}>
            {i > 0 && (
              <span className="pb-3 font-poster text-2xl text-white/30 sm:text-3xl">:</span>
            )}
            <div className="text-center">
              <p className="font-poster text-4xl tabular-nums leading-none text-white sm:text-5xl">
                {pad(value)}
              </p>
              <p className="mt-1 font-mono text-[9px] font-bold text-white/45">{unit}</p>
            </div>
          </React.Fragment>
        ))}
      </motion.div>
    </div>
  );
}
