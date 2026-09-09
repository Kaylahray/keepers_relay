'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { Lock } from 'lucide-react';

interface DeadOverlayProps {
  open: boolean;
  ownerCount: number;
  lastOwner: string;
  creatureName?: string;
  ageLabel?: string;
  creatorName?: string;
}

/** Permanent memorial — death is content, not a delete. */
export function DeadOverlay({
  open,
  ownerCount,
  lastOwner,
  creatureName = 'This Cell',
  ageLabel,
  creatorName,
}: DeadOverlayProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-[#0c0c12]/90 backdrop-blur-sm"
            style={{
              backgroundImage:
                'radial-gradient(ellipse 55% 45% at 50% 35%, rgba(175,42,58,0.35), transparent 55%), radial-gradient(ellipse 40% 30% at 80% 80%, rgba(168,85,247,0.15), transparent 50%)',
            }}
            aria-hidden
          />
          <motion.div
            role="alertdialog"
            aria-labelledby="dead-title"
            className="relative max-w-md border border-white/15 bg-[#121018] p-7 text-center text-white shadow-[0_0_50px_rgba(175,42,58,0.25)]"
            initial={{ scale: 0.94, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center border border-white/20 bg-black/50">
              <Lock className="h-7 w-7 text-[#99ee2d]" />
            </div>
            <p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
              Memorial
            </p>
            <h2
              id="dead-title"
              className="mt-2 font-poster text-4xl uppercase leading-[0.88] sm:text-5xl"
            >
              {creatureName}
              <br />
              died.
            </h2>
            <p className="mt-5 text-sm font-light leading-relaxed text-white/65">
              <span className="font-bold text-white">{lastOwner}</span> ran out of time. The Cell
              is locked. It lived
              {ageLabel ? (
                <>
                  {' '}
                  <span className="bg-[#99ee2d]/20 px-1 font-bold text-[#99ee2d]">{ageLabel}</span>
                </>
              ) : null}{' '}
              with{' '}
              <span className="bg-[#99ee2d]/20 px-1 font-bold text-[#99ee2d]">
                {ownerCount} keepers
              </span>
              {creatorName ? (
                <>
                  . Origin: <span className="font-bold text-white">{creatorName}</span>
                </>
              ) : null}
              . The lineage stays — nothing can recreate this exact chain.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              <Link
                href="/streaks"
                className="arena-cta inline-flex items-center px-5 py-3 text-sm font-bold uppercase"
              >
                See other Cells
              </Link>
              <Link
                href="/"
                className="inline-flex items-center border border-white/20 px-5 py-3 text-sm font-bold uppercase text-white/80 hover:bg-white/5"
              >
                Arena
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
