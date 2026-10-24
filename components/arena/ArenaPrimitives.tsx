import Link from 'next/link';
import type { ReactNode } from 'react';


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

