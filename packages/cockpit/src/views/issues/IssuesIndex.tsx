import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CircleDot, Network, Table2 } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { ISSUE_GRAPH_VIEW, ISSUE_VIEW_QUERY_PARAMETER, paths } from '../../model/routes.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import { CostBasisNote } from '../../widgets/Money.tsx';
import { IssueFilters } from './IssueFilters.tsx';
import type { IssueFilter } from './issue-model.ts';
import { filterIssues, NO_ISSUE_FILTER, sortIssues } from './issue-model.ts';
import { IssueTable } from './IssueTable.tsx';

const IssueGraph = lazy(() => import('./IssueGraph.tsx').then((module) => ({ default: module.IssueGraph })));

const DISPLAY_MODES = ['table', 'graph'] as const;
type DisplayMode = (typeof DISPLAY_MODES)[number];
const GRAPH_FALLBACK_HEIGHT = 420;
const ICON_SIZE = 14;

export function IssuesIndex() {
  const { t } = useI18n();
  const project = useProject();
  const { costs } = useSnapshot();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<IssueFilter>(NO_ISSUE_FILTER);
  const mode: DisplayMode = searchParams.get(ISSUE_VIEW_QUERY_PARAMETER) === ISSUE_GRAPH_VIEW ? 'graph' : 'table';
  const issues = useMemo(() => sortIssues(project.issues), [project.issues]);
  const visible = useMemo(() => filterIssues(issues, filter), [issues, filter]);
  const chooseMode = (next: DisplayMode) =>
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === 'graph') params.set(ISSUE_VIEW_QUERY_PARAMETER, ISSUE_GRAPH_VIEW);
        else params.delete(ISSUE_VIEW_QUERY_PARAMETER);
        return params;
      },
      { replace: true },
    );
  const modeLabels: Readonly<Record<DisplayMode, string>> = { table: t('issues.display.table'), graph: t('issues.display.graph') };
  return (
    <Page>
      <PageHeader
        title={t('issues.title')}
        count={issues.length}
        description={t('issues.description')}
        actions={
          <Segmented<DisplayMode>
            label={t('issues.display.label')}
            value={mode}
            onChange={chooseMode}
            items={DISPLAY_MODES.map((entry) => ({
              id: entry,
              label: modeLabels[entry],
              icon: entry === 'table' ? <Table2 size={ICON_SIZE} aria-hidden="true" /> : <Network size={ICON_SIZE} aria-hidden="true" />,
            }))}
          />
        }
      />
      {issues.length === 0 ? (
        <EmptyState
          icon={<CircleDot size={16} />}
          title={t('issues.none')}
          description={t('issues.noneDescription')}
          action={
            <Link to={paths.requests(project.id)} className="link">
              {t('issues.noneAction')}
            </Link>
          }
        />
      ) : mode === 'graph' ? (
        <Suspense fallback={<Skeleton height={GRAPH_FALLBACK_HEIGHT} />}>
          <IssueGraph issues={issues} />
        </Suspense>
      ) : (
        <div className="issues-index">
          <CostBasisNote basis={costs.basis} />
          <IssueFilters issues={issues} shown={visible.length} filter={filter} onChange={setFilter} />
          <div className="issues-index__table">
            <IssueTable issues={visible} empty={<EmptyState compact title={t('issues.noMatch')} description={t('issues.noMatchDescription')} />} />
          </div>
        </div>
      )}
    </Page>
  );
}
