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

export { KIND_STYLES };
