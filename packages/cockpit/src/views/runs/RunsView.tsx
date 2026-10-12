import './runs.css';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { SquareTerminal } from 'lucide-react';
import { useSnapshot } from '../../app/hooks.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths, PROJECT_QUERY_PARAMETER } from '../../model/routes.ts';
import { describeRunSubject } from '../../model/subjects.ts';
import { Button } from '../../ui/components/Button.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { ListPane, ListSection, SplitLayout } from '../../ui/layout/Page.tsx';
import { CostBasisNote } from '../../widgets/Money.tsx';
import { RunDetail } from './RunDetail.tsx';
import { RunFilters } from './RunFilters.tsx';
import { RunListItem } from './RunListItem.tsx';
import { basisOfRuns, FINISHED_PAGE_SIZE, filterRuns, groupRuns, isFiltering, pageOfFinished, resolveProjectFilter, runSearchText } from './run-list-model.ts';

const ICON_SIZE = 16;

export function RunsView() {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const snapshot = useSnapshot();
  const { runId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [pages, setPages] = useState(1);
  const project = resolveProjectFilter(snapshot.projects, searchParams.get(PROJECT_QUERY_PARAMETER));
  const filter = useMemo(() => ({ project, query }), [project, query]);
  const visible = useMemo(
    () => filterRuns(snapshot.runs, filter, (run) => runSearchText(run, { roleLabel: vocabulary.role(run.role), subject: describeRunSubject(snapshot, run) })),
    [snapshot, filter, vocabulary],
  );
  const groups = useMemo(() => groupRuns(visible), [visible]);
  const selected = runId === undefined ? (groups.live[0] ?? null) : (snapshot.runs.find((run) => run.id === runId) ?? null);
  const finished = pageOfFinished(groups.finished, pages, selected?.id ?? null);
  const basis = basisOfRuns(snapshot, [...groups.live, ...finished.shown]);

  const chooseProject = (next: string | null) => {
    setPages(1);
    setSearchParams(next === null ? {} : { [PROJECT_QUERY_PARAMETER]: next }, { replace: true });
  };
  const chooseQuery = (next: string) => {
    setPages(1);
    setQuery(next);
  };
  const clearFilters = () => {
    chooseQuery('');
    chooseProject(null);
  };

  const emptyDetail =
    runId !== undefined
      ? { title: t('runs.notFound'), description: t('runs.notFoundDescription') }
      : snapshot.runs.length === 0
        ? { title: t('runs.empty'), description: t('runs.emptyDescription') }
        : { title: t('runs.pick'), description: t('runs.pickDescription') };

  return (
    <SplitLayout
      listLabel={t('runs.listLabel')}
      hasSelection={runId !== undefined}
      list={
        <ListPane
          title={t('runs.title')}
          count={snapshot.runs.length}
          toolbar={
            snapshot.runs.length === 0 ? undefined : (
              <RunFilters
                projects={snapshot.projects}
                project={project}
                onProject={chooseProject}
                query={query}
                onQuery={chooseQuery}
                shown={visible.length}
                total={snapshot.runs.length}
                filtering={isFiltering(filter)}
                onClear={clearFilters}
              />
            )
          }
        >
          {basis === null ? null : (
            <div className="run-list__note">
              <CostBasisNote basis={basis} />
            </div>
          )}
          {snapshot.runs.length === 0 ? <EmptyState compact icon={<SquareTerminal size={ICON_SIZE} />} title={t('runs.empty')} description={t('runs.emptyDescription')} /> : null}
          {snapshot.runs.length > 0 && visible.length === 0 ? <EmptyState compact title={t('runs.noMatch')} description={t('runs.noMatchDescription')} /> : null}
          {groups.live.length === 0 ? null : (
            <ListSection title={t('runs.group.live')} count={groups.live.length}>
              {groups.live.map((run) => (
                <RunListItem key={run.id} run={run} active={run.id === selected?.id} showProject={project === null} filterProject={project} />
              ))}
            </ListSection>
          )}
          {groups.finished.length === 0 ? null : (
            <ListSection title={t('runs.group.finished')} count={groups.finished.length}>
              {finished.shown.map((run) => (
                <RunListItem key={run.id} run={run} active={run.id === selected?.id} showProject={project === null} filterProject={project} />
              ))}
              {finished.remaining === 0 ? null : (
                <div className="run-list__more">
                  <Button size="sm" variant="ghost" onClick={() => setPages((current) => current + 1)}>
                    {t('runs.showMore', { count: Math.min(FINISHED_PAGE_SIZE, finished.remaining) })}
                  </Button>
                </div>
              )}
            </ListSection>
          )}
        </ListPane>
      }
      detail={
        selected === null ? (
          <EmptyState icon={<SquareTerminal size={ICON_SIZE} />} headingLevel={2} title={emptyDetail.title} description={emptyDetail.description} />
        ) : (
          <RunDetail key={selected.id} run={selected} listPath={paths.runs(project)} />
        )
      }
    />
  );
}
