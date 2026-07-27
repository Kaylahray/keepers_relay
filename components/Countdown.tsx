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
  safe: '#224cff',
  warning: '#ff6b2d',
  critical: '#ff4cbd',
  dead: '#777777',
};

const LABEL: Record<string, string> = {
  safe: 'THE CHAIN LIVES',
  warning: 'THE CLOCK IS LOUD',
  critical: 'DON’T BREAK IT',
  dead: 'CHAIN DEAD',
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
    <div className="border-[3px] border-black bg-[#fff8e7] p-4 text-black shadow-[7px_7px_0_#101010]">
      <div className="flex items-center justify-between gap-3">
        <p
          className="border-2 border-black px-2 py-1 text-[10px] font-black tracking-[0.14em]"
          style={{ backgroundColor: color }}
        >
          {LABEL[state]}
        </p>
        <p className="font-mono text-[10px] font-bold">KEEPER WINDOW</p>
      </div>
      <motion.div
        className="mt-4 flex items-end justify-center gap-1.5 sm:gap-3"
        animate={state === 'critical' ? { x: [0, -2, 2, 0] } : {}}
        transition={{ duration: 0.45, repeat: Infinity }}
      >
        {segments.map(([value, unit], i) => (
          <React.Fragment key={unit}>
            {i > 0 && <span className="pb-5 font-poster text-3xl">:</span>}
            <div className="flex flex-col items-center">
              <span
                className="font-poster text-5xl leading-none sm:text-6xl"
                style={{ color: dead ? '#777777' : '#101010' }}
              >
                {pad(value)}
              </span>
              <span className="mt-2 border-t-2 border-black pt-1 font-mono text-[9px] font-bold">
                {unit}
              </span>
            </div>
          </React.Fragment>
        ))}
      </motion.div>
      <div className="mt-5 h-4 border-[3px] border-black bg-white p-[2px]">
        <motion.div
          className="h-full"
          style={{ backgroundColor: color }}
          animate={{ width: `${(1 - countdown.fractionElapsed) * 100}%` }}
          transition={{ ease: 'linear', duration: 0.4 }}
        />
      </div>
    </div>
  );
}
