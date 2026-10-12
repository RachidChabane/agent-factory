import './audits.css';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { AuditView } from '../../contract/index.ts';
import { relativeTime, toEpoch } from '../../format/format.ts';
import { AUDIT_REASON_LABELS, AUDIT_STATE_LABELS } from '../../i18n/labels.ts';
import { paths, VIEW_TITLES } from '../../model/routes.ts';
import { auditMark } from '../../model/status.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ListItemLink, SplitLayout } from '../../ui/layout/Page.tsx';
import { AuditDetail } from './AuditDetail.tsx';

function needsOperator(audit: AuditView): boolean {
  return (audit.state === 'challenge' || audit.state === 'rewrite') && !audit.resolved;
}

function sortAudits(audits: readonly AuditView[]): readonly AuditView[] {
  return audits.toSorted((left, right) => Number(needsOperator(right)) - Number(needsOperator(left)) || toEpoch(right.detectedAt) - toEpoch(left.detectedAt));
}

export function AuditsView() {
  const snapshot = useSnapshot();
  const now = useNow();
  const { auditId } = useParams();
  const sorted = useMemo(() => sortAudits(snapshot?.audits ?? []), [snapshot]);
  const selected = auditId === undefined ? (sorted[0] ?? null) : (sorted.find((audit) => audit.id === auditId) ?? null);
  if (snapshot === null) {
    return (
      <div className="detail">
        <Skeleton width="40%" height={20} />
        <Skeleton lines={8} />
      </div>
    );
  }
  return (
    <SplitLayout
      listLabel="Liste des audits"
      hasSelection={auditId !== undefined}
      list={
        <>
          <header className="list-pane__header">
            <h1 className="list-pane__title">
              {VIEW_TITLES.audits} <span className="list-pane__count num">{sorted.length}</span>
            </h1>
            <p className="audits-list__hint">Chaque changement arrivé sur la branche par défaut sans passer par l’usine est audité.</p>
          </header>
          <div className="list-pane__items">
            {sorted.map((audit) => (
              <ListItemLink key={audit.id} to={paths.audit(audit.id)} active={audit.id === selected?.id}>
                <StatusMark mark={auditMark(audit)} />
                <span className="list-item__body">
                  <span className="list-item__title">{audit.commitMessage}</span>
                  <span className="list-item__meta">
                    <span className="mono">{audit.id}</span>
                    <span className="dot-separator" />
                    <span className="truncate">{audit.authorName ?? audit.authorLogin ?? '—'}</span>
                  </span>
                  <span className={`audits-list__state${needsOperator(audit) ? ' is-attention' : ''}`}>
                    {AUDIT_STATE_LABELS[audit.state]}
                    {audit.resolved ? ' · résolu' : ''} · {AUDIT_REASON_LABELS[audit.reason]}
                  </span>
                </span>
                <span className="list-item__aside num">{relativeTime(audit.detectedAt, now)}</span>
              </ListItemLink>
            ))}
          </div>
        </>
      }
      detail={
        selected === null ? (
          <EmptyState icon={<ShieldAlert size={16} />} title={auditId === undefined ? 'Aucun audit' : 'Audit introuvable'} description="Tout ce qui arrive sur main hors de l’usine apparaîtra ici." />
        ) : (
          <AuditDetail key={selected.id} audit={selected} snapshot={snapshot} />
        )
      }
    />
  );
}
