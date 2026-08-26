import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'subtle' | 'ghost' | 'danger';
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  children,
  className = '',
  disabled,
  icon,
  loading = false,
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button--${variant} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="button__spinner" aria-hidden="true" size={19} /> : icon}
      <span className="button__label">{children}</span>
    </button>
  );
}
