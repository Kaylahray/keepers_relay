'use client';

import { Link, Sparkles } from 'lucide-react';

interface HeaderProps {
  chainId?: string;
  ownerCount?: number;
}

export function Header({ chainId, ownerCount }: HeaderProps) {
  return (
    <header className="mx-3 mt-3 flex w-auto items-center justify-between gap-4 border-[3px] border-black bg-[#224cff] px-4 py-3 text-black shadow-[6px_6px_0_#101010] sm:mx-6 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center border-[3px] border-black bg-[#d6ff00]">
          <Link className="h-5 w-5 stroke-[3]" aria-hidden="true" />
        </div>
        <div className="leading-none">
          <p className="font-poster text-2xl uppercase text-[#fff8e7] sm:text-3xl">Chain Letter</p>
          <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#d6ff00]">KEEP IT ALIVE. PASS IT ON.</p>
        </div>
      </div>

      <div className="hidden items-center gap-2 lg:flex">
        <code className="border-2 border-black bg-[#fff8e7] px-2 py-1 font-mono text-[10px] text-black">{chainId ?? '—'}</code>
        <span className="flex items-center gap-1.5 border-2 border-black bg-[#ff4cbd] px-2 py-1 font-mono text-[10px] font-bold text-black">
          <Sparkles className="h-3 w-3" />
          {ownerCount ?? 0} KEEPERS
        </span>
      </div>
    </header>
  );
}
