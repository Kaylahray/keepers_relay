'use client';

import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaStage } from '@/components/arena/ArenaStage';

export function SponsorView() {
  return (
    <ArenaStage backHref="/" backLabel="Home">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
        The pot
      </p>
      <h1 className="mt-3 font-poster text-[clamp(2.4rem,5vw,3.75rem)] uppercase leading-[0.92] text-white">
        Capacity is the prize
      </h1>
      <p className="mt-3 max-w-xl text-sm font-light leading-relaxed text-white/55">
        Every accepted steal adds the entry fee to the treasury cell. That capacity is the pot.
        Nobody sponsors a side pool. The king claims it when since reaches the deadline.
      </p>
      <div className="mt-10">
        <ArenaCta href="/play">Play</ArenaCta>
      </div>
    </ArenaStage>
  );
}
