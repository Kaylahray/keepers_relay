'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageShell } from '@/components/PageShell';
import { JoinHandleForm } from '@/components/JoinHandleForm';

function JoinInner() {
  const search = useSearchParams();
  const next = search.get('next');
  const nextHref =
    next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
    <PageShell
      eyebrow="Onboarding"
      title="Claim your handle."
      intro="Watch streaks without one. To hold, pass, or launch a Cell you need an on-chain @username — one wallet signature."
      backHref="/"
      backLabel="Home"
    >
      <section className="border-[3px] border-black bg-[#ffe454] p-5 text-black shadow-[8px_8px_0_#101010] sm:p-7">
        <JoinHandleForm nextHref={nextHref} />
      </section>
    </PageShell>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <PageShell eyebrow="Onboarding" title="Claim your handle.">
          <div className="h-40 animate-pulse border-[3px] border-black bg-[#ffe454]" />
        </PageShell>
      }
    >
      <JoinInner />
    </Suspense>
  );
}
