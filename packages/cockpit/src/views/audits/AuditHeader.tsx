import { Link } from 'react-router';
import { CalendarClock, GitBranch, GitCommitHorizontal, GitPullRequest, Rocket, User } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { AuditView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { shortSha } from '../../model/identifiers.ts';
import { paths } from '../../model/routes.ts';
import { auditMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { CopyButton } from '../../ui/components/CopyButton.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { DetailHeader, MetaItem } from '../../ui/layout/Page.tsx';
import { Time } from '../../widgets/Time.tsx';
import { AuditActions } from './AuditActions.tsx';
import { PullRequestLink } from './PullRequestLink.tsx';

const ICON_SIZE = 13;

function ReleaseReference({ audit }: { readonly audit: AuditView }) {
  const { t } = useI18n();
  const project = useProject();
  if (audit.releaseId === null) return <>{t('audits.release.none')}</>;
  const release = project.releases.find((entry) => entry.id === audit.releaseId);
  const label = t('audits.release.in', { id: audit.releaseId });
  return release === undefined ? (
    <>{label}</>
  ) : (
    <Link to={paths.release(project.id, release.id)} className="link">
      {label}
    </Link>
  );
}

interface AuditHeaderProps {
  readonly audit: AuditView;
  readonly onResolve: () => void;
}

export function AuditHeader({ audit, onResolve }: AuditHeaderProps) {
  const { t, rich } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const state = vocabulary.auditState(audit.state);
  return (
    <DetailHeader
      back={{ to: paths.audits(project.id), label: t('audits.back') }}
      eyebrow={
        <>
          <StatusMark mark={auditMark(audit)} label={state} />
          <span>{state}</span>
          {audit.resolved ? <Badge tone="success">{t('audits.resolvedMark')}</Badge> : null}
          <Badge>{vocabulary.auditReason(audit.reason)}</Badge>
        </>
      }
      title={audit.commitMessage}
      actions={<AuditActions audit={audit} onResolve={onResolve} />}
      meta={
        <>
          <MetaItem icon={<GitCommitHorizontal size={ICON_SIZE} />}>
            <span className="mono" title={audit.commitSha}>
              {shortSha(audit.commitSha)}
            </span>
            <CopyButton text={audit.commitSha} label={t('audits.copySha')} />
          </MetaItem>
          <MetaItem icon={<User size={ICON_SIZE} />}>
            <span className="visually-hidden">{t('audits.meta.author')} </span>
            {audit.authorLogin ?? t('audits.noAuthor')}
          </MetaItem>
          <MetaItem icon={<GitPullRequest size={ICON_SIZE} />}>{audit.pullRequestNumber === null ? t('audits.noPullRequest') : <PullRequestLink number={audit.pullRequestNumber} url={audit.pullRequestUrl} />}</MetaItem>
          <MetaItem icon={<GitBranch size={ICON_SIZE} />}>
            <span className="visually-hidden">{t('audits.meta.branch')} </span>
            {audit.branch === null ? t('audits.noBranch') : <span className="mono truncate">{audit.branch}</span>}
          </MetaItem>
          <MetaItem icon={<Rocket size={ICON_SIZE} />}>
            <ReleaseReference audit={audit} />
          </MetaItem>
          <MetaItem icon={<CalendarClock size={ICON_SIZE} />}>{rich('audits.meta.detected', { when: <Time iso={audit.detectedAt} mode="dateTime" /> })}</MetaItem>
        </>
      }
    />
  );
}
