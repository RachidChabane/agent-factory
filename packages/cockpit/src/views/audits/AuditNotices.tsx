import { Link } from 'react-router';
import { CircleAlert, GitBranch, ShieldCheck } from 'lucide-react';
import type { AuditReason } from '@agent-factory/domain';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { AuditView, ProjectSettingsView } from '../../contract/index.ts';
import type { Translate } from '../../i18n/create-i18n.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { holdsRelease } from './audit-model.ts';

const ICON_SIZE = 16;

function reasonExplanation(reason: AuditReason, t: Translate, settings: Pick<ProjectSettingsView, 'branchPrefix' | 'labels'>): string {
  switch (reason) {
    case 'direct-push':
      return t('audits.reason.direct-push');
    case 'bot-author':
      return t('audits.reason.bot-author');
    case 'branch-not-factory':
      return t('audits.reason.branch-not-factory', { prefix: settings.branchPrefix });
    case 'missing-factory-label':
      return t('audits.reason.missing-factory-label', { label: settings.labels.factory });
    case 'on-demand':
      return t('audits.reason.on-demand');
  }
}

/** Why the change is audited, what is wrong with the audit run, which release it holds back, and how it was resolved. */
export function AuditNotices({ audit }: { readonly audit: AuditView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const release = audit.releaseId === null ? undefined : project.releases.find((entry) => entry.id === audit.releaseId);
  const reason = vocabulary.auditReason(audit.reason);
  return (
    <>
      <section className="callout" aria-label={reason}>
        <GitBranch size={ICON_SIZE} aria-hidden="true" />
        <div className="callout__body">
          <p className="callout__title">{reason}</p>
          <p>{reasonExplanation(audit.reason, t, project.settings)}</p>
        </div>
      </section>
      {audit.failureCount === 0 ? null : (
        <section className="callout callout--failed" aria-label={t('audits.failure.title', { count: audit.failureCount })}>
          <CircleAlert size={ICON_SIZE} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">{t('audits.failure.title', { count: audit.failureCount })}</p>
            <p className="audit-notice__text">{audit.lastFailure ?? t('audits.failure.noReason')}</p>
          </div>
        </section>
      )}
      {release !== undefined && holdsRelease(audit, release) ? (
        <Link to={paths.release(project.id, release.id)} className="callout callout--running audit-notice--link">
          <CircleAlert size={ICON_SIZE} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">{t('audits.release.holds', { id: release.id })}</p>
            <p>{t('audits.release.holdsBody')}</p>
          </div>
        </Link>
      ) : null}
      {audit.resolved ? (
        <section className="callout callout--success" aria-label={t('audits.resolved.title')}>
          <ShieldCheck size={ICON_SIZE} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">{t('audits.resolved.title')}</p>
            <p className="audit-notice__text">{audit.resolutionNote ?? t('audits.resolved.noNote')}</p>
          </div>
        </section>
      ) : null}
    </>
  );
}
