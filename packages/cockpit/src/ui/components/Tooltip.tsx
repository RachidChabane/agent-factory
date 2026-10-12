import type { ReactElement, ReactNode } from 'react';
import { cloneElement, useId, useState } from 'react';

interface TooltipProps {
  readonly content: ReactNode;
  readonly children: ReactElement<{ 'aria-describedby'?: string | undefined }>;
  readonly side?: 'top' | 'bottom' | undefined;
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className="ds-tooltip-anchor"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span role="tooltip" id={id} className={`ds-tooltip ds-tooltip--${side}${open ? ' is-open' : ''}`}>
        {content}
      </span>
    </span>
  );
}
