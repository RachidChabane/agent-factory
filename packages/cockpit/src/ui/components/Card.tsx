import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  readonly padded?: boolean | undefined;
  readonly tone?: 'default' | 'inset' | undefined;
}

export function Card({ children, padded = true, tone = 'default', className, ...rest }: CardProps) {
  const classes = ['ds-card', `ds-card--${tone}`, padded ? 'ds-card--padded' : null, className].filter(Boolean).join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

interface SectionProps {
  readonly title: ReactNode;
  readonly actions?: ReactNode | undefined;
  readonly children: ReactNode;
  readonly description?: ReactNode | undefined;
  readonly id?: string | undefined;
}

export function Section({ title, actions, children, description, id }: SectionProps) {
  return (
    <section className="ds-section" aria-labelledby={id}>
      <header className="ds-section__header">
        <div className="ds-section__heading">
          <h2 className="ds-section__title" id={id}>
            {title}
          </h2>
          {description === undefined ? null : <p className="ds-section__description">{description}</p>}
        </div>
        {actions === undefined ? null : <div className="ds-section__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

interface StatProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: ReactNode | undefined;
  readonly children?: ReactNode | undefined;
}

export function Stat({ label, value, hint, children }: StatProps) {
  return (
    <div className="ds-stat">
      <span className="ds-stat__label">{label}</span>
      <span className="ds-stat__value num">{value}</span>
      {hint === undefined ? null : <span className="ds-stat__hint">{hint}</span>}
      {children}
    </div>
  );
}

interface PropertyListProps {
  readonly items: readonly { readonly label: string; readonly value: ReactNode }[];
}

export function PropertyList({ items }: PropertyListProps) {
  return (
    <dl className="ds-properties">
      {items.map((item) => (
        <div key={item.label} className="ds-properties__row">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
