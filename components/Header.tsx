'use client';

import Link from 'next/link';
import { ArrowUpRight, Sparkles } from 'lucide-react';

interface HeaderProps {
  chainId?: string;
  ownerCount?: number;
}

/** Identity strip for the chain currently on screen. */
export function Header({ chainId, ownerCount }: HeaderProps) {
  return (
    <div className="mx-3 mt-5 flex flex-wrap items-center justify-between gap-3 border-[3px] border-black bg-[#fff8e7] px-4 py-3 text-black shadow-[6px_6px_0_#101010] sm:mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.18em]">Now watching</span>
        <code className="border-2 border-black bg-white px-2 py-1 font-mono text-[10px]">
          {chainId ?? '—'}
        </code>
        <span className="flex items-center gap-1.5 border-2 border-black bg-[#ff4cbd] px-2 py-1 font-mono text-[10px] font-bold">
          <Sparkles className="h-3 w-3" />
          {ownerCount ?? 0} KEEPERS
        </span>
      </div>

      {chainId && (
        <Link
          href={`/chains/${chainId}`}
          className="flex items-center gap-1 border-2 border-black bg-[#d6ff00] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider"
        >
          Full chain record
          <ArrowUpRight className="h-3.5 w-3.5 stroke-[3]" />
        </Link>
      )}
    </div>
  );
}
