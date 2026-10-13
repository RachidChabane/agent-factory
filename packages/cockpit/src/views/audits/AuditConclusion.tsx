import { Link } from 'react-router';
import type { AuditConclusionView, AuditView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Time } from '../../widgets/Time.tsx';
import { findingsByLevel } from './audit-model.ts';

function PendingConclusion({ state }: { readonly state: AuditView['state'] }) {
  const { t } = useI18n();
  switch (state) {
    case 'detected':
      return <EmptyState compact title={t('audits.conclusion.noneDetected')} description={t('audits.conclusion.noneDetectedDescription')} />;
    case 'auditing':
      return <EmptyState compact title={t('audits.conclusion.noneAuditing')} description={t('audits.conclusion.noneDetectedDescription')} />;
    default:
      return <EmptyState compact title={t('audits.conclusion.noneOther')} />;
  }
}

function Findings({ conclusion }: { readonly conclusion: AuditConclusionView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  if (conclusion.findings.length === 0) return <p className="audit-detail__clean">{t('audits.conclusion.clean')}</p>;
  return (
    <div className="audit-findings">
      {findingsByLevel(conclusion.findings).map((group) => (
        <div key={group.level} className="audit-findings__group">
          <p className="audit-findings__level">{vocabulary.auditFindingLevel(group.level)}</p>
          <ul className="audit-findings__list">
            {group.findings.map((finding, position) => (
              <li key={`${position}-${finding.statement}`} className="audit-finding">
                <p className="audit-finding__statement">{finding.statement}</p>
                <p className="audit-finding__evidence">
                  <span className="small-caps">{t('audits.finding.evidence')}</span>
                  <span className="mono">{finding.evidence}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The auditor run that concluded, and when it did. */
function ConclusionStamp({ runId, concludedAt }: { readonly runId: string; readonly concludedAt: string | null }) {
  const { t, rich } = useI18n();
  return (
    <span className="audit-section__actions">
      {runId.length === 0 ? null : (
        <Link to={paths.run(runId)} className="link mono" aria-label={t('audits.conclusion.openRun', { run: runId })}>
          {runId}
        </Link>
      )}
      {concludedAt === null ? null : <span className="subtle">{rich('audits.conclusion.at', { when: <Time iso={concludedAt} /> })}</span>}
    </span>
  );
}

/** What the auditor concluded and when, level by level, and the fix it proposes. */
export function AuditConclusion({ audit }: { readonly audit: AuditView }) {
  const { t } = useI18n();
  const { conclusion } = audit;
  return (
    <>
      <Section
        title={t('audits.conclusion.title')}
        id="audit-conclusion"
        description={conclusion?.summary}
        actions={conclusion === null ? undefined : <ConclusionStamp runId={conclusion.runId} concludedAt={audit.concludedAt} />}
      >
        {conclusion === null ? <PendingConclusion state={audit.state} /> : <Findings conclusion={conclusion} />}
      </Section>
      {conclusion === null ? null : (
        <Section title={t('audits.fix.title')} id="audit-fix">
          {conclusion.proposedFix === null ? <p className="subtle">{t('audits.fix.none')}</p> : <p className="audit-detail__fix">{conclusion.proposedFix}</p>}
        </Section>
      )}
    </>
  );
}
