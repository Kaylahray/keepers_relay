'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { JoinHandleForm } from '@/components/JoinHandleForm';

function JoinForm() {
  const next = useSearchParams().get('next') || '/play';
  return (
    <ArenaStage backHref="/play" backLabel="Crowns">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
        Username
      </p>
      <h1 className="mt-3 font-poster text-5xl uppercase text-white">Claim your name</h1>
      <p className="mt-3 max-w-md text-sm text-white/60">
        Connect once from the header, then claim a handle. Hosting and playing use that name.
      </p>
      <div className="mt-8 max-w-md">
        <JoinHandleForm nextHref={next} />
      </div>
    </ArenaStage>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
