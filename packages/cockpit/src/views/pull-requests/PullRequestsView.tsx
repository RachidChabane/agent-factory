import './pull-requests.css';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { GitMerge, GitPullRequest } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { PullRequestView } from '../../contract/index.ts';
import { relativeTime, toEpoch } from '../../format/format.ts';
import { ISSUE_TYPE_LABELS } from '../../i18n/labels.ts';
import { paths, VIEW_TITLES } from '../../model/routes.ts';
import { checksSummaryMark } from '../../model/status.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ListItemLink, SplitLayout } from '../../ui/layout/Page.tsx';
import { PullRequestDetail } from './PullRequestDetail.tsx';

const STATE_ORDER: Readonly<Record<PullRequestView['state'], number>> = { open: 0, merged: 1, closed: 2 };

function sortPullRequests(pullRequests: readonly PullRequestView[]): readonly PullRequestView[] {
  return pullRequests.toSorted(
    (left, right) => STATE_ORDER[left.state] - STATE_ORDER[right.state] || toEpoch(right.openedAt) - toEpoch(left.openedAt),
  );
}

function listMark(pullRequest: PullRequestView) {
  if (pullRequest.state === 'merged') return <StatusMark mark="success" label="Mergée" />;
  if (pullRequest.state === 'closed') return <StatusMark mark="blocked" label="Fermée" />;
  if (pullRequest.mergeable) return <StatusMark mark="waiting" label="Prête à merger" />;
  return <StatusMark mark={checksSummaryMark(pullRequest.checks.map((check) => check.conclusion))} />;
}

export function PullRequestsView() {
  const snapshot = useSnapshot();
  const now = useNow();
  const { pullRequestNumber } = useParams();
  const sorted = useMemo(() => sortPullRequests(snapshot?.pullRequests ?? []), [snapshot]);
  const selected = pullRequestNumber === undefined ? (sorted[0] ?? null) : (sorted.find((entry) => String(entry.number) === pullRequestNumber) ?? null);

  if (snapshot === null) {
    return (
      <div className="detail">
        <Skeleton width="40%" height={20} />
        <Skeleton height={320} />
      </div>
    );
  }
  return (
    <SplitLayout
      listLabel="Liste des pull requests"
      hasSelection={pullRequestNumber !== undefined}
      list={
        <>
          <header className="list-pane__header">
            <h1 className="list-pane__title">
              {VIEW_TITLES['pull-requests']} <span className="list-pane__count num">{sorted.length}</span>
            </h1>
          </header>
          <div className="list-pane__items">
            {sorted.map((pullRequest) => (
              <ListItemLink key={pullRequest.number} to={paths.pullRequest(pullRequest.number)} active={pullRequest.number === selected?.number}>
                {listMark(pullRequest)}
                <span className="list-item__body">
                  <span className="list-item__title">
                    <span className="pr-list__number num">#{pullRequest.number}</span> {pullRequest.title}
                  </span>
                  <span className="list-item__meta">
                    <span>{ISSUE_TYPE_LABELS[pullRequest.type]}</span>
                    <span className="dot-separator" />
                    <span className="mono truncate">{pullRequest.branch}</span>
                  </span>
                  {pullRequest.state === 'open' && pullRequest.mergeable ? (
                    <span className="pr-list__ready">
                      <GitMerge size={12} aria-hidden="true" /> prête à merger
                    </span>
                  ) : null}
                </span>
                <span className="list-item__aside num">{relativeTime(pullRequest.mergedAt ?? pullRequest.openedAt, now)}</span>
              </ListItemLink>
            ))}
          </div>
        </>
      }
      detail={
        selected === null ? (
          <EmptyState icon={<GitPullRequest size={16} />} title={pullRequestNumber === undefined ? 'Aucune pull request' : 'Pull request introuvable'} description="Les pull requests de l’usine apparaissent ici avec leurs preuves." />
        ) : (
          <PullRequestDetail key={selected.number} pullRequest={selected} />
        )
      }
    />
  );
}
