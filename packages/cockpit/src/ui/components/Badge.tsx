import type { ReactNode } from 'react';
import type { StatusMark } from '../../model/status.ts';

export const BADGE_TONES = ['neutral', 'accent', 'running', 'waiting', 'success', 'failed', 'blocked', 'idle'] as const;
export type BadgeTone = (typeof BADGE_TONES)[number];

interface BadgeProps {
  readonly tone?: BadgeTone | StatusMark | undefined;
  readonly icon?: ReactNode | undefined;
  readonly children: ReactNode;
  readonly title?: string | undefined;
  readonly mono?: boolean | undefined;
}

export function Badge({ tone = 'neutral', icon, children, title, mono = false }: BadgeProps) {
  return (
    <span className={`ds-badge ds-badge--${tone}${mono ? ' ds-badge--mono' : ''}`} title={title}>
      {icon}
      {children}
    </span>
  );
}

interface CountBadgeProps {
  readonly count: number;
  readonly label?: string | undefined;
}

export function CountBadge({ count, label }: CountBadgeProps) {
  return (
    <span className="ds-count num" aria-label={label}>
      {count}
    </span>
  );
}
