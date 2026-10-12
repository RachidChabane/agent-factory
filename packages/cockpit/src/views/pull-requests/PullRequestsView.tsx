import './pull-requests.css';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { GitPullRequest } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { PullRequestState } from '../../contract/index.ts';
import { PULL_REQUEST_STATES } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { ListPane, ListSection, SplitLayout } from '../../ui/layout/Page.tsx';
import { PullRequestDetail } from './PullRequestDetail.tsx';
import { PullRequestListItem } from './PullRequestListItem.tsx';
import { groupPullRequests, orderedPullRequests } from './pull-request-model.ts';

const ICON_SIZE = 16;

export function PullRequestsView() {
  const { t } = useI18n();
  const project = useProject();
  const { number } = useParams();
  const groups = useMemo(() => groupPullRequests(project.pullRequests), [project.pullRequests]);
  const selected = number === undefined ? (orderedPullRequests(groups)[0] ?? null) : (project.pullRequests.find((entry) => String(entry.number) === number) ?? null);
  const headings: Readonly<Record<PullRequestState, string>> = {
    open: t('pullRequests.group.open'),
    merged: t('pullRequests.group.merged'),
    closed: t('pullRequests.group.closed'),
  };
  return (
    <SplitLayout
      listLabel={t('pullRequests.listLabel')}
      hasSelection={number !== undefined}
      list={
        <ListPane title={t('pullRequests.title')} count={project.pullRequests.length}>
          {project.pullRequests.length === 0 ? (
            <EmptyState compact icon={<GitPullRequest size={ICON_SIZE} />} title={t('pullRequests.empty')} description={t('pullRequests.emptyDescription')} />
          ) : null}
          {PULL_REQUEST_STATES.map((state) =>
            groups[state].length === 0 ? null : (
              <ListSection key={state} title={headings[state]} count={groups[state].length}>
                {groups[state].map((pullRequest) => (
                  <PullRequestListItem key={pullRequest.number} pullRequest={pullRequest} projectId={project.id} active={pullRequest.number === selected?.number} />
                ))}
              </ListSection>
            ),
          )}
        </ListPane>
      }
      detail={
        selected === null ? (
          number === undefined ? null : (
            <EmptyState icon={<GitPullRequest size={ICON_SIZE} />} headingLevel={2} title={t('pullRequests.notFound')} description={t('pullRequests.notFoundDescription')} />
          )
        ) : (
          <PullRequestDetail key={`${project.id}:${selected.number}`} pullRequest={selected} requested={number !== undefined} />
        )
      }
    />
  );
}
