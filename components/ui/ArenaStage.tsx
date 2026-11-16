'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

/** A page laid over the arena backdrop (the background picture lives in the root layout). */
export function ArenaStage({
  backHref,
  backLabel = 'Back',
  children,
  className = '',
}: {
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative min-h-[calc(100vh-4rem)] w-full text-chalk ${className}`}>

      <div className="relative mx-auto max-w-[1440px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        {backHref ? (
          <Link href={backHref} className="mb-6 inline-flex h-10 items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-fog hover:text-chalk">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel}
          </Link>
        ) : null}
        {children}
      </div>
    </div>
  );
}
