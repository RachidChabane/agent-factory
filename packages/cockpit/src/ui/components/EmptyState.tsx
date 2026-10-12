import type { ReactNode } from 'react';

interface EmptyStateProps {
  readonly icon?: ReactNode | undefined;
  readonly title: string;
  /** Makes the title a heading of this level, for a state that stands for a whole page or pane. */
  readonly headingLevel?: 1 | 2 | 3 | undefined;
  readonly description?: ReactNode | undefined;
  readonly action?: ReactNode | undefined;
  readonly compact?: boolean | undefined;
}

export function EmptyState({ icon, title, headingLevel, description, action, compact = false }: EmptyStateProps) {
  const Title = headingLevel === undefined ? 'p' : (`h${headingLevel}` as const);
  return (
    <div className={`ds-empty${compact ? ' ds-empty--compact' : ''}`}>
      {icon === undefined ? null : <div className="ds-empty__icon">{icon}</div>}
      <Title className="ds-empty__title">{title}</Title>
      {description === undefined ? null : <p className="ds-empty__description">{description}</p>}
      {action === undefined ? null : <div className="ds-empty__action">{action}</div>}
    </div>
  );
}
