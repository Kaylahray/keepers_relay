import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'lime' | 'pink' | 'gold' | 'chain' | 'fire' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

/** Round pills in the mode's colour. */
const VARIANTS: Record<ButtonVariant, string> = {
  lime: 'bg-lime text-ink hover:bg-[#a9f54a]',
  pink: 'bg-pink text-ink hover:bg-[#ff74f8]',
  gold: 'bg-gold text-ink hover:bg-[#ebcb5c]',
  chain: 'bg-chain text-white hover:bg-[#5479ff]',
  fire: 'bg-fire text-ink hover:bg-[#ff9a3d]',
  danger: 'bg-danger text-ink hover:bg-[#ff7373]',
  ghost: 'border-2 border-chalk/30 bg-black/30 text-chalk backdrop-blur hover:border-chalk',
  outline: 'border-2 border-line bg-ink-2 text-chalk hover:border-chalk/40',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-4 text-base',
  md: 'min-h-11 px-5 text-lg',
  lg: 'min-h-14 px-7 text-xl',
  xl: 'min-h-16 px-9 text-2xl',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-display font-black uppercase leading-none tracking-wide text-center text-balance select-none ' +
  'transition-[transform,background-color,filter] duration-150 ease-snap active:scale-[0.97] ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ' +
  'disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40';

/** The pill's classes, for a link or button that cannot use `Button`. */
export function buttonClass(variant: ButtonVariant = 'lime', size: ButtonSize = 'md', block = false, className = ''): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`;
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
  const key = href ? (
    external ? (
      <a href={href} target="_blank" rel="noreferrer" className={cls} style={style}>
        {children}
      </a>
    ) : (
      <Link href={href} className={cls} style={style} aria-disabled={rest.disabled || undefined}>
        {children}
      </Link>
    )
  ) : (
    <button type={type} className={cls} style={style} {...rest}>
      {children}
    </button>
  );
  return (
    <span className={`${block ? 'flex w-full' : 'inline-flex max-w-full'} ${className}`}>
      {key}
    </span>
  );
}
