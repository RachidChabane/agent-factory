import './audits.css';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';
import { ListPane, ListSection, SplitLayout } from '../../ui/layout/Page.tsx';
import { AuditDetail } from './AuditDetail.tsx';
import { AuditListItem } from './AuditListItem.tsx';
import type { AuditGroup, AuditListId } from './audit-model.ts';
import { AUDIT_GROUPS, AUDIT_LISTS, groupAudits, orderedAudits } from './audit-model.ts';
import { SkippedChanges } from './SkippedChanges.tsx';

const ICON_SIZE = 16;

export function AuditsView() {
  const { t } = useI18n();
  const project = useProject();
  const { auditId } = useParams();
  const [list, setList] = useState<AuditListId>('audits');
  const groups = useMemo(() => groupAudits(project.audits), [project.audits]);
  const selected = auditId === undefined ? (orderedAudits(groups)[0] ?? null) : (project.audits.find((audit) => audit.id === auditId) ?? null);
  const headings: Readonly<Record<AuditGroup, string>> = {
    attention: t('audits.group.attention'),
    inProgress: t('audits.group.inProgress'),
    settled: t('audits.group.settled'),
  };
  const switches: Readonly<Record<AuditListId, { readonly label: string; readonly count: number; readonly accessibleLabel: string }>> = {
    audits: { label: t('audits.view.audits'), count: project.audits.length, accessibleLabel: t('audits.view.auditsLabel', { count: project.audits.length }) },
    skipped: { label: t('audits.view.skipped'), count: project.skippedChanges.length, accessibleLabel: t('audits.view.skippedLabel', { count: project.skippedChanges.length }) },
  };
  const switcher = (
    <>
      <Segmented size="sm" label={t('audits.viewLabel')} value={list} onChange={setList} items={AUDIT_LISTS.map((id) => ({ id, ...switches[id] }))} />
      <p className="audits-list__hint">{t('audits.hint')}</p>
    </>
  );
  return (
    <SplitLayout
      listLabel={t('audits.listLabel')}
      hasSelection={auditId !== undefined}
      list={
        <ListPane title={t('audits.title')} count={project.audits.length} toolbar={switcher}>
          {list === 'skipped' ? (
            <SkippedChanges />
          ) : (
            <>
              {project.audits.length === 0 ? <EmptyState compact icon={<ShieldAlert size={ICON_SIZE} />} title={t('audits.empty')} description={t('audits.emptyDescription')} /> : null}
              {AUDIT_GROUPS.map((group) =>
                groups[group].length === 0 ? null : (
                  <ListSection key={group} title={headings[group]} count={groups[group].length}>
                    {groups[group].map((audit) => (
                      <AuditListItem key={audit.id} audit={audit} projectId={project.id} active={audit.id === selected?.id} />
                    ))}
                  </ListSection>
                ),
              )}
            </>
          )}
        </ListPane>
      }
      detail={
        selected === null ? (
          auditId === undefined ? null : <EmptyState icon={<ShieldAlert size={ICON_SIZE} />} headingLevel={2} title={t('audits.notFound')} description={t('audits.notFoundDescription')} />
        ) : (
          <AuditDetail key={`${project.id}:${selected.id}`} audit={selected} />
        )
      }
    />
  );
}
