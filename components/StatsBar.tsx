'use client';

import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';

interface StatsBarProps {
  ownerCount: number;
  trophyGoal: number;
  windowHours: number;
  dead: boolean;
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="border-2 border-black p-2" style={{ backgroundColor: color }}>
      <span className="font-poster text-2xl leading-none">{value}</span>
      <span className="mt-1 block text-[9px] font-black uppercase tracking-wider">{label}</span>
    </div>
  );
}

export function StatsBar({ ownerCount, trophyGoal, windowHours, dead }: StatsBarProps) {
  const progress = Math.min(1, ownerCount / trophyGoal);
  const windowLabel = windowHours >= 24 ? `${Math.round(windowHours / 24)}D` : `${windowHours}H`;

  return (
    <div className="neo-card bg-black p-4 text-[#fff8e7]">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#d6ff00]">
          Chain vital signs
        </p>
        <span className="border-2 border-[#fff8e7] px-2 py-1 font-mono text-[9px] font-bold">
          LIVE CELL
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Keepers" value={String(ownerCount)} color="#d6ff00" />
        <Stat label="Pass window" value={windowLabel} color="#ff4cbd" />
        <Stat label="Status" value={dead ? 'DEAD' : 'ALIVE'} color={dead ? '#777777' : '#ffe454'} />
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-[#d6ff00]">
            <Trophy className="h-4 w-4 stroke-[3]" /> Trophy at {trophyGoal}
          </span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-5 border-[3px] border-[#fff8e7] bg-black p-[2px]">
          <motion.div
            className="h-full bg-[#d6ff00]"
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  );
}
