import { useState } from 'react';
import type { Reading, WorkflowRun } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { shortSha } from '../../model/identifiers.ts';
import { workflowMark } from '../../model/status.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import type { TableColumn } from '../../ui/components/Table.tsx';
import { DataTable } from '../../ui/components/Table.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';
import { OptionalReadingView } from '../../widgets/ReadingView.tsx';
import { Time } from '../../widgets/Time.tsx';
import { ForgeLink } from './ForgeLink.tsx';
import type { WorkflowFilter } from './workflow-model.ts';
import { durationOf, filterWorkflows, newestFirst, triggerLabel, WORKFLOW_FILTERS, workflowCounts, workflowStatusLabel } from './workflow-model.ts';

function RunDuration({ run }: { readonly run: WorkflowRun }) {
  const { t, fmt } = useI18n();
  const duration = durationOf(run);
  if (duration.kind === 'measured') return <span className="num">{fmt.duration(duration.milliseconds)}</span>;
  return <span className="subtle">{duration.kind === 'running' ? t('delivery.workflows.durationRunning') : t('delivery.workflows.durationUnreported')}</span>;
}

function useRunColumns(): readonly TableColumn<WorkflowRun>[] {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return [
    {
      id: 'status',
      header: t('delivery.workflows.column.status'),
      cell: (run) => {
        const label = workflowStatusLabel(run, vocabulary);
        return (
          <span className="delivery-status">
            <StatusMark mark={workflowMark(run)} label={label} />
            {label}
          </span>
        );
      },
    },
    { id: 'workflow', header: t('delivery.workflows.column.workflow'), cell: (run) => run.workflow },
    { id: 'title', header: t('delivery.workflows.column.title'), primary: true, cell: (run) => <span className="truncate">{run.title}</span> },
    { id: 'branch', header: t('delivery.workflows.column.branch'), hideOnMobile: true, cell: (run) => <span className="mono">{run.branch}</span> },
    { id: 'commit', header: t('delivery.workflows.column.commit'), hideOnMobile: true, cell: (run) => <span className="mono">{shortSha(run.sha)}</span> },
    { id: 'trigger', header: t('delivery.workflows.column.trigger'), hideOnMobile: true, cell: (run) => triggerLabel(run.trigger, t) },
    {
      id: 'actor',
      header: t('delivery.workflows.column.actor'),
      hideOnMobile: true,
      cell: (run) => (run.actor === null ? <span className="subtle">{t('delivery.workflows.actorUnknown')}</span> : run.actor),
    },
    { id: 'started', header: t('delivery.workflows.column.started'), cell: (run) => <Time iso={run.startedAt} className="num" /> },
    { id: 'duration', header: t('delivery.workflows.column.duration'), hideOnMobile: true, cell: (run) => <RunDuration run={run} /> },
    {
      id: 'open',
      header: <span className="visually-hidden">{t('delivery.workflows.column.open')}</span>,
      align: 'end',
      cell: (run) => <ForgeLink href={run.url} label={t('delivery.workflows.open', { title: run.title, workflow: run.workflow })} />,
    },
  ];
}

function WorkflowTable({ runs }: { readonly runs: readonly WorkflowRun[] }) {
  const { t } = useI18n();
  const columns = useRunColumns();
  const [filter, setFilter] = useState<WorkflowFilter>('all');
  const counts = workflowCounts(runs);
  const labels: Readonly<Record<WorkflowFilter, string>> = {
    all: t('delivery.workflows.filter.all'),
    running: t('delivery.workflows.filter.running'),
    failed: t('delivery.workflows.filter.failed'),
  };
  return (
    <div className="workflow-runs">
      <Segmented
        label={t('delivery.workflows.filter')}
        size="sm"
        value={filter}
        onChange={setFilter}
        items={WORKFLOW_FILTERS.map((id) => ({ id, label: labels[id], count: counts[id] }))}
      />
      <div className="workflow-runs__table">
        <DataTable
          label={t('delivery.workflows.title')}
          rows={filterWorkflows(newestFirst(runs), filter)}
          columns={columns}
          rowKey={(run) => run.id}
          dense
          empty={<EmptyState compact title={t('delivery.workflows.filterEmpty')} />}
        />
      </div>
    </div>
  );
}

/** The workflow runs of the project's forge, newest first, in each state a reading of them can be in. */
export function WorkflowRuns({ workflows }: { readonly workflows: Reading<WorkflowRun[]> | null }) {
  const { t } = useI18n();
  return (
    <OptionalReadingView
      reading={workflows}
      kind="forge"
      absent={t('delivery.workflows.none')}
      notRead={t('delivery.workflows.notRead')}
      isEmpty={(runs) => runs.length === 0}
      empty={t('delivery.workflows.empty')}
    >
      {(runs) => <WorkflowTable runs={runs} />}
    </OptionalReadingView>
  );
}
