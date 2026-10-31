import type { ReactNode } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';

/** The main call to action: a lime arcade key with our pointed edge. */
export function ArenaCta({
  href,
  children,
  className = '',
  onClick,
  type = 'button',
  disabled,
  variant = 'lime',
  size = 'lg',
}: {
  href?: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Button href={href} onClick={onClick} type={type} disabled={disabled} variant={variant} size={size} className={className}>
      {children}
    </Button>
  );
}
