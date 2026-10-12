import { Link } from 'react-router';
import { ExternalLink, GitBranch, GitPullRequest, Inbox } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { IssueView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { paths } from '../../model/routes.ts';
import { MetaItem } from '../../ui/layout/Page.tsx';
import { Time } from '../../widgets/Time.tsx';

function RequestOrigin({ issue }: { readonly issue: IssueView }) {
  const { t } = useI18n();
  const project = useProject();
  if (issue.requestId === null) return <MetaItem icon={<Inbox size={13} />}>{t('issues.noRequest')}</MetaItem>;
  const request = project.requests.find((entry) => entry.id === issue.requestId);
  return (
    <MetaItem icon={<Inbox size={13} />}>
      {request === undefined ? (
        t('issues.requestMissing', { id: issue.requestId })
      ) : (
        <Link to={paths.request(project.id, request.id)} className="link">
          {request.id} · {request.title}
        </Link>
      )}
    </MetaItem>
  );
}

export function IssueMeta({ issue }: { readonly issue: IssueView }) {
  const { t, rich } = useI18n();
  const project = useProject();
  return (
    <>
      <RequestOrigin issue={issue} />
      <MetaItem icon={<GitBranch size={13} />}>{issue.branch === null ? t('issues.noBranch') : <span className="mono truncate">{issue.branch}</span>}</MetaItem>
      <MetaItem icon={<GitPullRequest size={13} />}>
        {issue.pullRequestNumber === null ? (
          t('issues.noPullRequest')
        ) : (
          <Link to={paths.pullRequest(project.id, issue.pullRequestNumber)} className="link">
            {t('issues.pullRequest', { number: issue.pullRequestNumber })}
          </Link>
        )}
      </MetaItem>
      <MetaItem>{rich('issues.updated', { when: <Time iso={issue.updatedAt} /> })}</MetaItem>
      <MetaItem icon={<ExternalLink size={13} />}>
        {issue.url.length === 0 ? (
          t('issues.noForgeLink')
        ) : (
          <a href={issue.url} target="_blank" rel="noreferrer" className="link">
            {t('common.openOnForge')}
          </a>
        )}
      </MetaItem>
    </>
  );
}
