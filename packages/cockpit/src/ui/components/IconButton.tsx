import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  readonly label: string;
  readonly icon: ReactNode;
  readonly size?: 'sm' | 'md' | undefined;
  readonly badge?: number | undefined;
  readonly active?: boolean | undefined;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'md', badge, active = false, className, type = 'button', ...rest },
  ref,
) {
  const classes = ['ds-icon-button', `ds-icon-button--${size}`, active ? 'is-active' : null, className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={classes} aria-label={label} title={label} {...rest}>
      {icon}
      {badge !== undefined && badge > 0 ? (
        <span className="ds-icon-button__badge num" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  );
});
