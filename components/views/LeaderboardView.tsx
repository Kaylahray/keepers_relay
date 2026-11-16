'use client';

import { motion } from 'framer-motion';
import { LatestRaces, LeaderboardBoard } from '@/components/crowns/Board';
import { EASE } from '@/components/crowns/motion';
import { IMG } from '@/lib/crowns/art';

/** The full leaderboard: most CKB won or most shards, and the latest races. */
export function LeaderboardView() {
  return (
    <>
      <section className="relative isolate overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG.trophy} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover object-[center_35%] opacity-50" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/60 to-ink/30" />
        <div className="mx-auto max-w-[1440px] px-5 pb-10 pt-16 sm:px-8 sm:pt-28">
          <motion.h1
            initial={{ opacity: 0, x: -32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="font-display text-[64px] font-black uppercase leading-[0.85] sm:text-[120px]"
          >
            Leader
            <br />
            <span className="text-gold">board</span>
          </motion.h1>
        </div>
      </section>
      <div className="mx-auto grid max-w-[1440px] gap-16 px-5 pb-16 sm:px-8 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
        <LeaderboardBoard limit={20} />
        <div>
          <h2 className="mb-4 font-display text-4xl font-black uppercase">Latest races</h2>
          <LatestRaces limit={12} />
        </div>
      </div>
    </>
  );
}
