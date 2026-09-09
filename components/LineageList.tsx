'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Crown, Lock } from 'lucide-react';
import type { Owner } from '@/types/chain';

function profileHref(name: string): string {
  return `/profile/${encodeURIComponent(name.toLowerCase())}`;
}

interface LineageListProps {
  owners: Owner[];
  dead: boolean;
}

export function LineageList({ owners, dead }: LineageListProps) {
  const ordered = [...owners].reverse();

  return (
    <ol className="relative flex flex-col">
      <span className="absolute bottom-4 left-[17px] top-4 w-[2px] bg-white/20" aria-hidden="true" />
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
                className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 font-mono text-[11px] font-bold ${
                  current ? (dead ? 'bg-white/20' : 'bg-[#ff56f6]') : 'bg-[#e1bf47]/90 text-black'
                }`}
              >
                {current && dead ? <Lock className="h-4 w-4" /> : position}
              </span>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-3 border-b border-white/10 pb-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold uppercase text-white">
                    <Link href={profileHref(owner.name)} className="underline-offset-2 hover:underline">
                      {owner.name}
                    </Link>
                    {current && !dead && (
                      <span className="ml-2 rounded bg-[#ff56f6] px-1.5 py-0.5 align-middle text-[9px] font-bold">
                        HOLDING
                      </span>
                    )}
                  </p>
                  <code className="font-mono text-[10px] font-bold text-white/40">
                    {owner.city ? `${owner.city} · ` : ''}
                    {owner.cellHash}
                  </code>
                </div>
                <span className="shrink-0 text-right font-mono text-[10px] font-bold text-white/45">
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
        <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-[#406aff] text-white">
          <Crown className="h-4 w-4" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[.16em] text-white/50">Genesis Cell</span>
      </li>
    </ol>
  );
}
