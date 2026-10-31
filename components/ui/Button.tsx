import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'lime' | 'pink' | 'gold' | 'chain' | 'fire' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

/** Flat arcade keys in the mode's colour. */
const VARIANTS: Record<ButtonVariant, string> = {
  lime: 'bg-lime text-ink hover:bg-[#a9f54a]',
  pink: 'bg-pink text-ink hover:bg-[#ff74f8]',
  gold: 'bg-gold text-ink hover:bg-[#ebcb5c]',
  chain: 'bg-chain text-white hover:bg-[#5479ff]',
  fire: 'bg-fire text-ink hover:bg-[#ff9a3d]',
  danger: 'bg-danger text-ink hover:bg-[#ff7373]',
  ghost: 'bg-ink-3 text-white hover:bg-ink-4',
  outline: 'bg-white/[0.06] text-white hover:bg-white/[0.12]',
};

/** A soft glow in the key's colour, as the design has. */
const GLOW: Partial<Record<ButtonVariant, string>> = {
  lime: 'drop-shadow(0 0 12px rgba(153, 238, 45, 0.45))',
  pink: 'drop-shadow(0 0 12px rgba(255, 86, 246, 0.45))',
  gold: 'drop-shadow(0 0 12px rgba(225, 191, 71, 0.4))',
  fire: 'drop-shadow(0 0 12px rgba(255, 138, 31, 0.45))',
  danger: 'drop-shadow(0 0 10px rgba(255, 90, 90, 0.4))',
  chain: 'drop-shadow(0 0 10px rgba(64, 106, 255, 0.4))',
};

/** Our pointed right edge, deeper on bigger keys. */
const SIZES: Record<ButtonSize, { box: string; tip: number }> = {
  sm: { box: 'h-9 pl-3.5 pr-6 text-[10px]', tip: 10 },
  md: { box: 'h-11 pl-5 pr-8 text-[11px]', tip: 13 },
  lg: { box: 'h-14 pl-6 pr-10 text-xs', tip: 16 },
  xl: { box: 'h-16 pl-8 pr-12 text-sm', tip: 18 },
};

const BASE =
  'inline-flex items-center justify-center gap-2 font-poster font-bold uppercase tracking-wide whitespace-nowrap select-none ' +
  'transition-[transform,background-color,filter] duration-150 ease-snap active:translate-y-[2px] ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ' +
  'disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40';

/** The key's classes, for a link or button that cannot use `Button` (no glow). */
export function buttonClass(variant: ButtonVariant = 'lime', size: ButtonSize = 'md', block = false, className = ''): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size].box} ${block ? 'w-full' : ''} ${className}`;
}

export function tipStyle(size: ButtonSize = 'md') {
  const tip = SIZES[size].tip;
  return { clipPath: `polygon(0 0, calc(100% - ${tip}px) 0, 100% 50%, calc(100% - ${tip}px) 100%, 0 100%)` };
}

type Props = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  block?: boolean;
  /** Placement classes (margins, widths); they go on the outside of the key. */
  className?: string;
  children: ReactNode;
  /** Opens the link in a new tab (explorer links). */
  external?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>;

export function Button({ variant = 'lime', size = 'md', href, block, className = '', children, external, type = 'button', style, ...rest }: Props) {
  const cls = buttonClass(variant, size, true);
  const shape = { ...tipStyle(size), ...style };
  const glow = rest.disabled ? undefined : GLOW[variant];
  const key = href ? (
    external ? (
      <a href={href} target="_blank" rel="noreferrer" className={cls} style={shape}>
        {children}
      </a>
    ) : (
      <Link href={href} className={cls} style={shape} aria-disabled={rest.disabled || undefined}>
        {children}
      </Link>
    )
  ) : (
    <button type={type} className={cls} style={shape} {...rest}>
      {children}
    </button>
  );
  return (
    <span className={`${block ? 'flex w-full' : 'inline-flex'} ${className}`} style={glow ? { filter: glow } : undefined}>
      {key}
    </span>
  );
}
