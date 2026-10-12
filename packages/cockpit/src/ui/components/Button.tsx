import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

export const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger', 'accent'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_SIZES = ['sm', 'md'] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly icon?: ReactNode | undefined;
  readonly trailing?: ReactNode | undefined;
  readonly loading?: boolean | undefined;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, trailing, loading = false, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const classes = ['ds-button', `ds-button--${variant}`, `ds-button--${size}`, className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled === true || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="ds-button__spinner" aria-hidden="true" /> : icon}
      {children === undefined ? null : <span className="ds-button__label">{children}</span>}
      {trailing}
    </button>
  );
});
