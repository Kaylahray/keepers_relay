import Link from 'next/link';
import { Timer, Coins } from 'lucide-react';
import type { ReactNode } from 'react';

export type CellKind = 'blitz' | 'quest' | 'archive';

const KIND_STYLES: Record<
  CellKind,
  { bg: string; ink: string; label: string; blurb: string; href: string }
> = {
  blitz: {
    bg: 'bg-blitz',
    ink: 'text-white',
    label: 'Blitz',
    blurb: 'Stakes on. Pot grows. Clock shrinks. Pass or forfeit.',
    href: '/launch?kind=blitz',
  },
  quest: {
    bg: 'bg-quest',
    ink: 'text-ink',
    label: 'Quest',
    blurb: 'Return-home. New Keepers only — then bring it back.',
    href: '/launch?kind=quest',
  },
  archive: {
    bg: 'bg-archive',
    ink: 'text-ink',
    label: 'Archive',
    blurb: 'Long windows. Soft pot. Lineage over speed.',
    href: '/launch?kind=archive',
  },
};

export function ArenaButton({
  children,
  href,
  onClick,
  tone = 'signal',
  className = '',
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: 'signal' | 'blitz' | 'quest' | 'archive' | 'ghost' | 'paper';
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const tones: Record<string, string> = {
    signal: 'bg-signal text-white',
    blitz: 'bg-blitz text-white',
    quest: 'bg-quest text-ink',
    archive: 'bg-archive text-ink',
    ghost: 'bg-white/10 text-paper hover:bg-white/16',
    paper: 'bg-paper text-ink',
  };
  const cls = `inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition hover:brightness-110 disabled:opacity-40 ${tones[tone]} ${className}`;
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

export function ArenaCard({
  children,
  className = '',
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius)] border border-white/10 bg-surface p-5 shadow-[0_16px_40px_rgba(0,0,0,0.28)] ${
        hover ? 'arena-card-hover' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function KindCard({ kind, index = 0 }: { kind: CellKind; index?: number }) {
  const s = KIND_STYLES[kind];
  return (
    <Link
      href={s.href}
      className={`card-enter arena-card-hover block overflow-hidden rounded-[var(--radius)] ${s.bg} ${s.ink} p-5 min-h-[11rem]`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">Season kind</p>
      <h3 className="mt-3 font-poster text-3xl uppercase leading-none sm:text-4xl">{s.label}</h3>
      <p className="mt-3 max-w-[16rem] text-sm font-semibold leading-snug opacity-90">{s.blurb}</p>
      <p className="mt-6 text-[10px] font-bold uppercase tracking-wider opacity-80">Enter →</p>
    </Link>
  );
}

export function FeaturedPanel({
  eyebrow,
  title,
  body,
  children,
  className = '',
}: {
  eyebrow: string;
  title: ReactNode;
  body: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-[calc(var(--radius)+0.25rem)] bg-gradient-to-br from-[#2a1248] via-[#1a1035] to-[#0d1f2e] p-6 text-paper sm:p-8 ${className}`}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blitz/30 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-signal/25 blur-3xl"
        aria-hidden
      />
      <p className="relative text-[10px] font-bold uppercase tracking-[0.22em] text-quest">{eyebrow}</p>
      <h2 className="relative mt-3 font-poster text-4xl uppercase leading-[.9] sm:text-5xl">{title}</h2>
      <p className="relative mt-4 max-w-xl text-sm font-semibold leading-relaxed text-fog">{body}</p>
      {children ? <div className="relative mt-6">{children}</div> : null}
    </section>
  );
}

export function PotChip({ amount, pulse = false }: { amount: number; pulse?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-blitz/20 px-2.5 py-1 font-mono text-[10px] font-bold text-pot-glow ${
        pulse && amount > 0 ? 'pot-pulse' : ''
      }`}
    >
      <Coins className="h-3 w-3" />
      {amount} CKB
    </span>
  );
}

export function ClockChip({
  label,
  urgent = false,
}: {
  label: string;
  urgent?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 font-mono text-[10px] font-bold text-paper ${
        urgent ? 'clock-urgent text-blitz' : ''
      }`}
    >
      <Timer className="h-3 w-3" />
      {label}
    </span>
  );
}

export function SectionLabel({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="font-poster text-3xl uppercase leading-none text-paper sm:text-4xl">
        {children}
      </h2>
      {hint ? <p className="mt-2 max-w-2xl text-sm font-semibold text-fog">{hint}</p> : null}
    </div>
  );
}
