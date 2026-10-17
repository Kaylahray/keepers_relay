'use client';

import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaStage } from '@/components/arena/ArenaStage';

export function LeaderboardView() {
  return (
    <ArenaStage backHref="/" backLabel="Home">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
        The crown
      </p>
      <h1 className="mt-3 font-poster text-[clamp(2.4rem,5vw,3.75rem)] uppercase leading-[0.92] text-white">
        One king
      </h1>
      <p className="mt-3 max-w-xl text-sm font-light leading-relaxed text-white/55">
        There is no separate ranking table. The match cell names the king. When the clock hits
        zero, that lock takes the treasury.
      </p>
      <div className="mt-10">
        <ArenaCta href="/play">Enter the scramble</ArenaCta>
      </div>
    </ArenaStage>
  );
}
