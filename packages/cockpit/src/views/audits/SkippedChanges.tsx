import { Link } from 'react-router';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { SkippedChangeView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { shortSha } from '../../model/identifiers.ts';
import { paths } from '../../model/routes.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { CommandButton } from '../../widgets/CommandButton.tsx';
import { Time } from '../../widgets/Time.tsx';
import { auditOfSkippedChange, newestSkippedFirst } from './audit-model.ts';
import { PullRequestLink } from './PullRequestLink.tsx';

const ICON_SIZE = 13;
const EMPTY_ICON_SIZE = 16;

function SkippedChangeItem({ change }: { readonly change: SkippedChangeView }) {
  const { t, rich } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const audit = auditOfSkippedChange(project.audits, change);
  const commit = shortSha(change.commitSha);
  return (
    <li className="skipped-change">
      <div className="skipped-change__head">
        <span className="mono" title={change.commitSha}>
          {commit}
        </span>
        <Badge tone="idle">{t('audits.skipped.badge', { automation: change.automation })}</Badge>
      </div>
      <p className="skipped-change__message">{change.commitMessage}</p>
      <p className="skipped-change__meta">
        <span>{change.authorLogin ?? t('audits.noAuthor')}</span>
        {change.branch === null ? <span>{t('audits.noBranch')}</span> : <span className="mono">{change.branch}</span>}
        {change.pullRequestNumber === null ? <span>{t('audits.noPullRequest')}</span> : <PullRequestLink number={change.pullRequestNumber} url={change.pullRequestUrl} />}
        <span>{rich('audits.skipped.recorded', { when: <Time iso={change.recordedAt} /> })}</span>
      </p>
      <div className="skipped-change__actions">
        <CommandButton
          command="audit.request"
          body={{ project: project.id, commitSha: change.commitSha }}
          size="sm"
          icon={<ShieldCheck size={ICON_SIZE} />}
          aria-label={t('audits.skipped.requestLabel', { commit })}
        >
          {t('audits.skipped.request')}
        </CommandButton>
        {audit === undefined ? null : (
          <Link to={paths.audit(project.id, audit.id)} className="link">
            {t('audits.skipped.audit', { state: vocabulary.auditState(audit.state) })}
          </Link>
        )}
      </div>
    </li>
  );
}

/** The changes of the project's other automations, recorded without an audit, each with the way to audit it anyway. */
export function SkippedChanges() {
  const { t, fmt } = useI18n();
  const project = useProject();
  const changes = project.skippedChanges;
  if (changes.length > 0) {
    return (
      <>
        <p className="audits-list__hint">{t('audits.skipped.description')}</p>
        <ul className="skipped-list" aria-label={t('audits.skipped.list')}>
          {newestSkippedFirst(changes).map((change) => (
            <SkippedChangeItem key={change.commitSha} change={change} />
          ))}
        </ul>
      </>
    );
  }
  const automations = project.settings.automations.map((automation) => automation.name);
  return automations.length === 0 ? (
    <EmptyState compact icon={<ShieldOff size={EMPTY_ICON_SIZE} />} title={t('audits.skipped.noAutomation')} description={t('audits.skipped.noAutomationDescription')} />
  ) : (
    <EmptyState compact icon={<ShieldOff size={EMPTY_ICON_SIZE} />} title={t('audits.skipped.none')} description={t('audits.skipped.noneDescription', { automations: fmt.list(automations) })} />
  );
}
