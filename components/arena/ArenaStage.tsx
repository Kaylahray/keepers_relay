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
    <div className={`relative min-h-[calc(100vh-4rem)] w-full text-white ${className}`}>

      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-6 md:px-8 md:pt-10">
        {backHref ? (
          <Link href={backHref} className="mb-6 inline-flex h-10 items-center gap-2 text-sm font-semibold text-mute hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel}
          </Link>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** Compact room / event row for a side rail. */
export function ArenaRailCard({
  href,
  eyebrow,
  title,
  meta,
  cover,
  cta = 'Enter',
}: {
  href: string;
  eyebrow: string;
  title: string;
  meta: string;
  cover?: string | null;
  cta?: string;
}) {
  return (
    <Link href={href} className="group flex gap-3 rounded-2xl bg-ink-2 p-2.5 transition-colors hover:bg-ink-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cover || '/arena/road-lime.jpg'} alt="" className="h-16 w-14 shrink-0 rounded-xl bg-ink object-cover" />
      <span className="min-w-0 flex-1 self-center">
        <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-lime">{eyebrow}</span>
        <span className="mt-0.5 block truncate font-poster text-base uppercase leading-tight text-white">{title}</span>
        <span className="mt-1 block truncate text-[11px] text-mute">{meta}</span>
      </span>
      <span className="self-center font-mono text-[10px] font-bold uppercase text-mute group-hover:text-lime">{cta}</span>
    </Link>
  );
}
