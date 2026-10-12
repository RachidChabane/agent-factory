import type { ReactNode } from 'react';
import { CountBadge } from './Badge.tsx';

interface ColumnProps {
  readonly id: string;
  readonly title: string;
  readonly count: number;
  readonly children: ReactNode;
  readonly accent?: boolean | undefined;
}

export function Column({ id, title, count, children, accent = false }: ColumnProps) {
  const headingId = `${id}-heading`;
  return (
    <section className={`ds-column${accent ? ' ds-column--accent' : ''}`} aria-labelledby={headingId}>
      <header className="ds-column__header">
        <h2 className="ds-column__title small-caps" id={headingId}>
          {title}
        </h2>
        <CountBadge count={count} />
      </header>
      <div className="ds-column__body">{children}</div>
    </section>
  );
}
