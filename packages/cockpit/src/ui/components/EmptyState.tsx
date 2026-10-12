import type { ReactNode } from 'react';

interface EmptyStateProps {
  readonly icon?: ReactNode | undefined;
  readonly title: string;
  readonly description?: ReactNode | undefined;
  readonly action?: ReactNode | undefined;
  readonly compact?: boolean | undefined;
}

export function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`ds-empty${compact ? ' ds-empty--compact' : ''}`}>
      {icon === undefined ? null : <div className="ds-empty__icon">{icon}</div>}
      <p className="ds-empty__title">{title}</p>
      {description === undefined ? null : <p className="ds-empty__description">{description}</p>}
      {action === undefined ? null : <div className="ds-empty__action">{action}</div>}
    </div>
  );
}
