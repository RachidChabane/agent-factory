import './issues.css';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CircleDot, Network, Table2 } from 'lucide-react';
import { useSnapshot } from '../../app/hooks.ts';
import { ISSUE_GRAPH_QUERY, ISSUE_GRAPH_VALUE, VIEW_TITLES } from '../../model/routes.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import { IssueDetail } from './IssueDetail.tsx';
import type { IssueGroup } from './issue-model.ts';
import { ISSUE_GROUP_LABELS, ISSUE_GROUPS, issuesInGroup } from './issue-model.ts';
import { IssueTable } from './IssueTable.tsx';

const IssueGraph = lazy(() => import('./IssueGraph.tsx').then((module) => ({ default: module.IssueGraph })));

const DISPLAY_MODES = ['table', 'graph'] as const;
type DisplayMode = (typeof DISPLAY_MODES)[number];
const DISPLAY_LABELS: Readonly<Record<DisplayMode, string>> = { table: 'Tableau', graph: 'Graphe' };

function IssuesIndex() {
  const snapshot = useSnapshot();
  const [searchParams, setSearchParams] = useSearchParams();
  const [group, setGroup] = useState<IssueGroup>('all');
  const mode: DisplayMode = searchParams.get(ISSUE_GRAPH_QUERY) === ISSUE_GRAPH_VALUE ? 'graph' : 'table';
  const issues = useMemo(() => (snapshot === null ? [] : snapshot.issues.toSorted((left, right) => right.number - left.number)), [snapshot]);
  const visible = useMemo(() => issuesInGroup(issues, group), [issues, group]);
  const setMode = (next: DisplayMode) => setSearchParams(next === 'graph' ? { [ISSUE_GRAPH_QUERY]: ISSUE_GRAPH_VALUE } : {}, { replace: true });
  return (
    <Page>
      <PageHeader
        title={VIEW_TITLES.issues}
        count={snapshot === null ? undefined : issues.length}
        description="Chaque issue est une spécification : besoin, critères observables, hors périmètre, preuve attendue."
        actions={
          <Segmented
            label="Affichage"
            value={mode}
            onChange={setMode}
            items={DISPLAY_MODES.map((entry) => ({
              id: entry,
              label: DISPLAY_LABELS[entry],
              icon: entry === 'table' ? <Table2 size={14} aria-hidden="true" /> : <Network size={14} aria-hidden="true" />,
            }))}
          />
        }
      />
      {snapshot === null ? (
        <Skeleton lines={8} height={28} />
      ) : mode === 'graph' ? (
        <Suspense fallback={<Skeleton height={420} />}>
          <IssueGraph issues={issues} />
        </Suspense>
      ) : (
        <div className="issues-index">
          <div className="issues-index__filters">
            <Segmented
              label="Filtrer les issues"
              size="sm"
              value={group}
              onChange={setGroup}
              items={ISSUE_GROUPS.map((entry) => ({ id: entry, label: ISSUE_GROUP_LABELS[entry], count: issuesInGroup(issues, entry).length }))}
            />
          </div>
          <div className="issues-index__table">
            <IssueTable issues={visible} all={issues} />
          </div>
        </div>
      )}
    </Page>
  );
}

export function IssuesView() {
  const snapshot = useSnapshot();
  const { issueNumber } = useParams();
  if (issueNumber === undefined) return <IssuesIndex />;
  if (snapshot === null) {
    return (
      <div className="detail">
        <Skeleton width="50%" height={22} />
        <Skeleton lines={10} />
      </div>
    );
  }
  const issue = snapshot.issues.find((entry) => String(entry.number) === issueNumber);
  if (issue === undefined) {
    return (
      <Page width="narrow">
        <EmptyState icon={<CircleDot size={16} />} title={`L’issue #${issueNumber} est introuvable`} description="Elle n’est peut-être pas suivie par l’usine." />
      </Page>
    );
  }
  return <IssueDetail key={issue.number} issue={issue} snapshot={snapshot} />;
}
