'use client';

import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { resolveCover } from '@/lib/poster';

type OrbState = 'safe' | 'warning' | 'critical' | 'dead';

interface ChainOrbProps {
  state: OrbState;
  cellHash?: string;
  coverImageUrl?: string;
  creatureName?: string;
}

const PALETTE: Record<OrbState, { face: string; burst: string }> = {
  safe: { face: '#d6ff00', burst: '#ff4cbd' },
  warning: { face: '#ffe454', burst: '#ff6b2d' },
  critical: { face: '#ff4cbd', burst: '#224cff' },
  dead: { face: '#777777', burst: '#101010' },
};

/** The single CKB Cell as a loud, collectible poster-object. */
export function ChainOrb({
  state,
  cellHash,
  coverImageUrl,
  creatureName,
}: ChainOrbProps) {
  const color = PALETTE[state];
  const dead = state === 'dead';
  const cover = resolveCover(coverImageUrl, creatureName || 'Cell');

  return (
    <div className="relative flex h-[260px] w-[260px] items-center justify-center" aria-hidden="true">
      {!dead && (
        <motion.div
          className="absolute h-[230px] w-[230px] bg-[#ff4cbd]"
          style={{
            clipPath:
              'polygon(50% 0%,61% 28%,85% 7%,77% 34%,100% 50%,75% 61%,91% 87%,62% 77%,50% 100%,38% 76%,12% 92%,24% 62%,0% 50%,27% 38%,8% 12%,38% 25%)',
          }}
          animate={{ rotate: [0, 5, -4, 0], scale: [1, 1.04, 1] }}
          transition={{ duration: state === 'critical' ? 0.7 : 2.4, repeat: Infinity }}
        />
      )}
      <motion.div
        className="relative flex h-44 w-44 items-center justify-center border-[6px] border-black bg-[#224cff] shadow-[10px_10px_0_#101010]"
        animate={dead ? {} : { rotate: [0, -3, 2, 0] }}
        transition={{ duration: state === 'critical' ? 0.55 : 2.7, repeat: Infinity }}
      >
        <div
          className="relative h-32 w-32 overflow-hidden border-[5px] border-black"
          style={{ backgroundColor: color.face }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" className="h-full w-full object-cover" />
          {dead && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55">
              <Lock className="h-9 w-9 stroke-[3] text-[#fff8e7]" />
            </div>
          )}
        </div>
        <span className="absolute -right-4 -top-4 border-2 border-black bg-[#fff8e7] px-1.5 py-1 font-mono text-[9px] font-bold text-black">
          CELL
        </span>
      </motion.div>
      {cellHash && (
        <code className="absolute -bottom-4 border-2 border-black bg-[#fff8e7] px-2 py-1 font-mono text-[10px] font-bold text-black">
          {cellHash}
        </code>
      )}
    </div>
  );
}
