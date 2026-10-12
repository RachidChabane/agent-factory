import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  readonly title: ReactNode;
  readonly count?: number | undefined;
  readonly countLabel?: string | undefined;
  readonly description?: ReactNode | undefined;
  readonly actions?: ReactNode | undefined;
}

export function PageHeader({ title, count, countLabel = 'au total', description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__heading">
        <h1 className="page-header__title">
          {title}
          {count === undefined ? null : (
            <span className="page-header__count num">
              {count} {countLabel}
            </span>
          )}
        </h1>
        {description === undefined ? null : <p className="page-header__description">{description}</p>}
      </div>
      {actions === undefined ? null : <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

interface PageProps {
  readonly children: ReactNode;
  readonly width?: 'full' | 'wide' | 'narrow' | undefined;
  readonly className?: string | undefined;
}

export function Page({ children, width = 'wide', className }: PageProps) {
  return <div className={['page', `page--${width}`, className].filter(Boolean).join(' ')}>{children}</div>;
}

interface SplitLayoutProps {
  readonly list: ReactNode;
  readonly detail: ReactNode;
  readonly hasSelection: boolean;
  readonly listLabel: string;
  readonly listWidth?: 'narrow' | 'medium' | undefined;
}

export function SplitLayout({ list, detail, hasSelection, listLabel, listWidth = 'medium' }: SplitLayoutProps) {
  return (
    <div className={`split split--${listWidth}${hasSelection ? ' has-selection' : ''}`}>
      <section className="split__list" aria-label={listLabel}>
        {list}
      </section>
      <section className="split__detail" aria-live="polite">
        {detail}
      </section>
    </div>
  );
}

export function BackLink({ to, label }: { readonly to: string; readonly label: string }) {
  return (
    <Link to={to} className="back-link">
      <ArrowLeft size={14} aria-hidden="true" />
      {label}
    </Link>
  );
}

interface DetailHeaderProps {
  readonly eyebrow?: ReactNode | undefined;
  readonly title: ReactNode;
  readonly meta?: ReactNode | undefined;
  readonly actions?: ReactNode | undefined;
  readonly back?: { readonly to: string; readonly label: string } | undefined;
}

export function DetailHeader({ eyebrow, title, meta, actions, back }: DetailHeaderProps) {
  return (
    <header className="detail-header">
      {back === undefined ? null : (
        <div className="detail-header__back">
          <BackLink to={back.to} label={back.label} />
        </div>
      )}
      {eyebrow === undefined ? null : <div className="detail-header__eyebrow">{eyebrow}</div>}
      <div className="detail-header__row">
        <h1 className="detail-header__title">{title}</h1>
        {actions === undefined ? null : <div className="detail-header__actions">{actions}</div>}
      </div>
      {meta === undefined ? null : <div className="detail-header__meta">{meta}</div>}
    </header>
  );
}

export function MetaItem({ icon, children }: { readonly icon?: ReactNode | undefined; readonly children: ReactNode }) {
  return (
    <span className="meta-item">
      {icon}
      {children}
    </span>
  );
}

export function ListItemLink({ children, active, to }: { readonly children: ReactNode; readonly active: boolean; readonly to: string }) {
  return (
    <Link to={to} className={`list-item${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  );
}
