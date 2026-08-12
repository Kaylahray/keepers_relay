'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { Lock } from 'lucide-react';

interface DeadOverlayProps {
  open: boolean;
  ownerCount: number;
  lastOwner: string;
}

export function DeadOverlay({ open, ownerCount, lastOwner }: DeadOverlayProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#ff4cbd] p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute left-[9%] top-[12%] h-12 w-12 bg-[#d6ff00]" aria-hidden="true" />
          <div
            className="absolute bottom-[12%] right-[9%] h-16 w-16 bg-[#224cff]"
            aria-hidden="true"
          />
          <motion.div
            role="alertdialog"
            aria-labelledby="dead-title"
            className="relative max-w-md border-[5px] border-black bg-[#fff8e7] p-7 text-center shadow-[12px_12px_0_#101010]"
            initial={{ scale: 0.86, rotate: -3 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            <div className="mx-auto flex h-20 w-20 items-center justify-center border-[4px] border-black bg-[#777777]">
              <Lock className="h-9 w-9 stroke-[3]" />
            </div>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[.2em]">Permanent archive</p>
            <h2 id="dead-title" className="mt-2 font-poster text-5xl uppercase leading-[.8]">
              Chain
              <br />
              dead.
            </h2>
            <p className="mt-5 text-sm font-semibold leading-relaxed">
              <span className="font-black">{lastOwner}</span> ran out of time. This Cell is locked.
              It survived{' '}
              <span className="bg-[#d6ff00] px-1 font-black">{ownerCount} KEEPERS</span>.
            </p>
            <Link
              href="/streaks"
              className="neo-button mx-auto mt-7 inline-flex items-center gap-2 bg-[#224cff] px-5 py-3 text-sm font-black uppercase text-[#fff8e7]"
            >
              See other streaks
            </Link>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
