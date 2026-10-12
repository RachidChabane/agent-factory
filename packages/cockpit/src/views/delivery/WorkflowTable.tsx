import { ExternalLink } from 'lucide-react';
import type { WorkflowRun } from '../../contract/index.ts';
import { duration, relativeTime } from '../../format/format.ts';
import { WORKFLOW_TRIGGER_LABELS } from '../../i18n/labels.ts';
import { workflowMark } from '../../model/status.ts';
import type { TableColumn } from '../../ui/components/Table.tsx';
import { DataTable } from '../../ui/components/Table.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { NO_DURATION_LABEL, RUNNING_DURATION_LABEL, workflowStatusLabel } from './delivery-model.ts';

const EMPTY_TITLE = 'Aucune exécution';
const EMPTY_DESCRIPTION = 'Aucune exécution de workflow ne correspond à ce filtre.';
const STATUS_COLUMN_WIDTH = '132px';
const BRANCH_COLUMN_WIDTH = '200px';
const WORKFLOW_COLUMN_WIDTH = '140px';
const TRIGGER_COLUMN_WIDTH = '120px';
const ACTOR_COLUMN_WIDTH = '160px';
const STARTED_COLUMN_WIDTH = '80px';
const DURATION_COLUMN_WIDTH = '96px';
const LINK_COLUMN_WIDTH = '48px';

function durationLabel(run: WorkflowRun): string {
  if (run.durationMs !== null) return duration(run.durationMs);
  return run.status === 'completed' ? NO_DURATION_LABEL : RUNNING_DURATION_LABEL;
}

function buildColumns(now: number): TableColumn<WorkflowRun>[] {
  return [
    {
      id: 'status',
      header: 'Statut',
      width: STATUS_COLUMN_WIDTH,
      cell: (run) => (
        <span className="delivery-status">
          <StatusMark mark={workflowMark(run)} label={workflowStatusLabel(run)} />
          {workflowStatusLabel(run)}
        </span>
      ),
    },
    { id: 'workflow', header: 'Workflow', width: WORKFLOW_COLUMN_WIDTH, cell: (run) => <span className="truncate delivery-cell">{run.workflow}</span> },
    { id: 'title', header: 'Titre', primary: true, cell: (run) => <span className="truncate delivery-cell">{run.title}</span> },
    {
      id: 'branch',
      header: 'Branche',
      width: BRANCH_COLUMN_WIDTH,
      hideOnMobile: true,
      cell: (run) => <span className="mono truncate delivery-cell">{run.branch}</span>,
    },
    { id: 'trigger', hideOnMobile: true, header: 'Déclencheur', width: TRIGGER_COLUMN_WIDTH, cell: (run) => WORKFLOW_TRIGGER_LABELS[run.trigger] },
    {
      id: 'actor',
      header: 'Auteur',
      width: ACTOR_COLUMN_WIDTH,
      hideOnMobile: true,
      cell: (run) => <span className="truncate delivery-cell">{run.actor}</span>,
    },
    { id: 'started', header: 'Début', width: STARTED_COLUMN_WIDTH, cell: (run) => <span className="num">{relativeTime(run.startedAt, now)}</span> },
    { id: 'duration', hideOnMobile: true, header: 'Durée', width: DURATION_COLUMN_WIDTH, cell: (run) => <span className="num">{durationLabel(run)}</span> },
    {
      id: 'link',
      header: <span className="visually-hidden">Ouvrir</span>,
      width: LINK_COLUMN_WIDTH,
      align: 'end',
      cell: (run) => (
        <a className="delivery-open" href={run.url} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${run.workflow} sur GitHub`}>
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      ),
    },
  ];
}

interface WorkflowTableProps {
  readonly runs: readonly WorkflowRun[];
  readonly now: number;
}

export function WorkflowTable({ runs, now }: WorkflowTableProps) {
  return (
    <DataTable
      label="Exécutions de workflows"
      rows={runs}
      columns={buildColumns(now)}
      rowKey={(run) => run.id}
      dense
      empty={<EmptyState compact title={EMPTY_TITLE} description={EMPTY_DESCRIPTION} />}
    />
  );
}
