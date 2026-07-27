'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Crown, Lock } from 'lucide-react';
import type { Owner } from '@/types/chain';

interface LineageListProps {
  owners: Owner[];
  dead: boolean;
}

export function LineageList({ owners, dead }: LineageListProps) {
  const ordered = [...owners].reverse();

  return (
    <ol className="relative flex flex-col">
      <span className="absolute bottom-4 left-[17px] top-4 w-[3px] bg-black" aria-hidden="true" />
      <AnimatePresence initial={false}>
        {ordered.map((owner, i) => {
          const position = owners.length - i;
          const current = i === 0;
          return (
            <motion.li
              key={owner.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="relative flex items-center gap-3 py-3"
            >
              <span
                className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center border-[3px] border-black font-mono text-[11px] font-bold ${
                  current ? (dead ? 'bg-[#777777]' : 'bg-[#d6ff00]') : 'bg-[#ffe454]'
                }`}
              >
                {current && dead ? <Lock className="h-4 w-4 stroke-[3]" /> : position}
              </span>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-3 border-b-2 border-black pb-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black uppercase">
                    {owner.name}
                    {current && !dead && (
                      <span className="ml-2 bg-[#ff4cbd] px-1.5 py-0.5 align-middle text-[9px] font-black">
                        HOLDING
                      </span>
                    )}
                  </p>
                  <code className="font-mono text-[10px] font-bold text-black/50">{owner.cellHash}</code>
                </div>
                <span className="shrink-0 text-right font-mono text-[10px] font-bold text-black/55">
                  {owner.passedAt
                    ? `PASSED ${formatDistanceToNow(new Date(owner.passedAt), { addSuffix: true }).replace(' ago', '')}`
                    : `HELD ${formatDistanceToNow(new Date(owner.receivedAt), { addSuffix: true }).replace(' ago', '')}`}
                </span>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
      <li className="relative flex items-center gap-3 pt-3">
        <span className="relative z-10 flex h-9 w-9 items-center justify-center border-[3px] border-black bg-[#224cff] text-[#fff8e7]">
          <Crown className="h-4 w-4 stroke-[3]" />
        </span>
        <span className="text-[10px] font-black uppercase tracking-[.16em]">Genesis Cell</span>
      </li>
    </ol>
  );
}
