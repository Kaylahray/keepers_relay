'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

/**
 * Full-bleed arena stage: dark Uismod base + violet glow (old Squid-arena energy),
 * optional side rail with a vertical demarcation line.
 */
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
    <div
      className={`relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-[#0c0c12] text-white ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/uismod/hero-bg.png"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 70% 40%, rgba(168,85,247,0.28), transparent 55%), radial-gradient(ellipse 50% 40% at 15% 80%, rgba(153,238,45,0.08), transparent 50%), linear-gradient(to bottom, transparent 40%, #0c0c12 95%)',
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay"
        style={{ backgroundImage: "url('/uismod/noise.png')", backgroundSize: '420px' }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1440px] px-5 pb-20 pt-8 sm:px-10">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-6 inline-flex items-center gap-1.5 border border-white/15 bg-black/30 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/75 backdrop-blur-sm hover:bg-white/5"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** Compact room / event row for the featured side rail. */
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
    <Link
      href={href}
      className="group flex gap-3 border border-white/10 bg-black/45 p-2.5 backdrop-blur-md transition hover:border-[#99ee2d]/50 hover:bg-black/60"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover || '/uismod/game-1.png'}
        alt=""
        className="h-16 w-14 shrink-0 bg-black/50 object-contain"
      />
      <span className="min-w-0 flex-1 self-center">
        <span className="block font-mono text-[9px] font-bold uppercase tracking-wider text-[#99ee2d]">
          {eyebrow}
        </span>
        <span className="mt-0.5 block truncate font-poster text-lg uppercase leading-none text-white">
          {title}
        </span>
        <span className="mt-1 block truncate text-[11px] text-white/50">{meta}</span>
      </span>
      <span className="self-center font-mono text-[9px] font-bold uppercase text-white/40 group-hover:text-[#99ee2d]">
        {cta}
      </span>
    </Link>
  );
}
