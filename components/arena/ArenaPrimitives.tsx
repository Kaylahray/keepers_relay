import Link from 'next/link';
import type { ReactNode } from 'react';

export type CellKind = 'blitz' | 'quest' | 'archive';

const KIND_STYLES: Record<
  CellKind,
  { bg: string; label: string; href: string; blurb: string; art: string }
> = {
  blitz: {
    bg: 'bg-[#af2a3a]',
    label: 'Blitz',
    href: '/launch?kind=blitz',
    blurb: 'Stakes on. Pot grows. Clock shrinks.',
    art: '/arena/kind-blitz.png',
  },
  quest: {
    bg: 'bg-[#e1bf47]',
    label: 'Quest',
    href: '/launch?kind=quest',
    blurb: 'Return-home. A finish line.',
    art: '/arena/kind-quest.png',
  },
  archive: {
    bg: 'bg-[#49b649]',
    label: 'Archive',
    href: '/launch?kind=archive',
    blurb: 'Long tradition. Prestige over pressure.',
    art: '/arena/kind-archive.png',
  },
};

export function ArenaCta({
  href,
  children,
  className = '',
  onClick,
  type = 'button',
  disabled,
}: {
  href?: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}) {
  const cls = `arena-cta inline-flex items-center justify-center gap-2 rounded px-8 py-3.5 text-[15px] font-bold uppercase tracking-wide disabled:opacity-40 ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export function PotChip({ amount, pulse }: { amount: number; pulse?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded bg-white/10 px-2 py-1 font-mono text-[10px] font-bold uppercase text-[#99ee2d] ${
        pulse ? 'pot-pulse' : ''
      }`}
    >
      Pot {amount} CKB
    </span>
  );
}

export function ClockChip({ label, urgent }: { label: string; urgent?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded bg-white/10 px-2 py-1 font-mono text-[10px] font-bold uppercase ${
        urgent ? 'clock-urgent text-[#99ee2d]' : 'text-white/80'
      }`}
    >
      {label}
    </span>
  );
}

/** Vertical kind card — full figure visible, not crop-to-fill */
export function KindCard({ kind }: { kind: CellKind }) {
  const meta = KIND_STYLES[kind];
  return (
    <Link
      href={meta.href}
      className={`arena-card relative flex h-[300px] w-full flex-col overflow-hidden rounded sm:h-[340px] ${meta.bg}`}
    >
      <span className="relative z-10 p-3 font-poster text-xl uppercase leading-none text-white sm:text-2xl">
        {meta.label}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={meta.art}
        alt=""
        className="absolute inset-x-0 bottom-0 top-12 mx-auto h-[calc(100%-3rem)] w-auto max-w-[95%] object-contain object-bottom"
      />
      <span className="absolute bottom-3 right-3 z-10 rounded bg-black/40 px-2 py-1.5 font-mono text-[10px] font-bold text-white backdrop-blur-md">
        Enter
      </span>
    </Link>
  );
}

export { KIND_STYLES };
