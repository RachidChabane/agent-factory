import { Link } from 'react-router';
import type { RunView } from '../../contract/index.ts';
import { commitReference, compact, duration, usd } from '../../format/format.ts';
import { paths } from '../../model/routes.ts';
import { RoleGlyph } from '../../ui/components/RoleGlyph.tsx';
import type { TableColumn } from '../../ui/components/Table.tsx';
import { DataTable } from '../../ui/components/Table.tsx';
import { runDurationMs, runsByCost } from './costs-model.ts';

function SubjectCell({ run }: { readonly run: RunView }) {
  const issueNumber = Number(run.subject.id);
  if (run.subject.kind === 'issue' && Number.isInteger(issueNumber)) {
    return (
      <Link to={paths.issue(issueNumber)} className="costs-link num">
        #{run.subject.id}
      </Link>
    );
  }
  return <span className="mono">{commitReference(run.subject.id)}</span>;
}

function runColumns(now: number): readonly TableColumn<RunView>[] {
  return [
    {
      id: 'id',
      header: 'Run',
      primary: true,
      cell: (run) => (
        <Link to={paths.run(run.id)} className="costs-link mono">
          {run.id}
        </Link>
      ),
    },
    { id: 'role', header: 'Rôle', hideOnMobile: true, cell: (run) => <RoleGlyph role={run.role} labelled /> },
    { id: 'subject', header: 'Sujet', cell: (run) => <SubjectCell run={run} /> },
    { id: 'model', header: 'Modèle', hideOnMobile: true, cell: (run) => <span className="mono">{run.model}</span> },
    {
      id: 'tokens',
      header: 'Tokens',
      align: 'end',
      hideOnMobile: true,
      cell: (run) => <span className="num">{compact(run.usage.inputTokens + run.usage.outputTokens)}</span>,
    },
    { id: 'cost', header: 'Coût', align: 'end', cell: (run) => <span className="num">{usd(run.costUsd)}</span> },
    { id: 'duration', header: 'Durée', align: 'end', hideOnMobile: true, cell: (run) => <span className="num">{duration(runDurationMs(run, now))}</span> },
  ];
}

export function CostsRuns({ runs, now }: { readonly runs: readonly RunView[]; readonly now: number }) {
  return <DataTable label="Runs par coût" rows={runsByCost(runs)} columns={runColumns(now)} rowKey={(run) => run.id} dense />;
}
