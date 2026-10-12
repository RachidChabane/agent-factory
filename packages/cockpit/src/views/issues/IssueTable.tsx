import { useNavigate } from 'react-router';
import { useNow } from '../../app/context.tsx';
import type { IssueView } from '../../contract/index.ts';
import { relativeTime } from '../../format/format.ts';
import { ISSUE_STATE_LABELS, ISSUE_TYPE_LABELS } from '../../i18n/labels.ts';
import { paths } from '../../model/routes.ts';
import { issueMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import type { TableColumn } from '../../ui/components/Table.tsx';
import { DataTable } from '../../ui/components/Table.tsx';

export function IssueTable({ issues, all }: { readonly issues: readonly IssueView[]; readonly all: readonly IssueView[] }) {
  const navigate = useNavigate();
  const now = useNow();
  const byNumber = new Map(all.map((issue) => [issue.number, issue]));
  const columns: readonly TableColumn<IssueView>[] = [
    { id: 'mark', header: <span className="visually-hidden">État</span>, width: '36px', cell: (issue) => <StatusMark mark={issueMark(issue.state)} /> },
    { id: 'number', header: 'N°', width: '64px', cell: (issue) => <span className="issues-table__number num">#{issue.number}</span> },
    {
      id: 'title',
      header: 'Titre',
      primary: true,
      cell: (issue) => (
        <span className="issues-table__title">
          <span className="truncate">{issue.title}</span>
          {issue.paused ? <Badge tone="idle">en pause</Badge> : null}
        </span>
      ),
    },
    { id: 'type', header: 'Type', width: '130px', hideOnMobile: true, cell: (issue) => <Badge>{ISSUE_TYPE_LABELS[issue.type]}</Badge> },
    { id: 'state', header: 'État', width: '170px', cell: (issue) => <span className="issues-table__state">{ISSUE_STATE_LABELS[issue.state]}</span> },
    {
      id: 'dependencies',
      header: 'Dépend de',
      width: '140px',
      hideOnMobile: true,
      cell: (issue) =>
        issue.dependsOn.length === 0 ? (
          <span className="subtle">—</span>
        ) : (
          <span className="issues-table__deps">
            {issue.dependsOn.map((number) => {
              const dependency = byNumber.get(number);
              return (
                <span key={number} className="issues-table__dep num">
                  {dependency === undefined ? null : <StatusMark mark={issueMark(dependency.state)} size={11} />}#{number}
                </span>
              );
            })}
          </span>
        ),
    },
    {
      id: 'pr',
      header: 'PR',
      width: '72px',
      hideOnMobile: true,
      cell: (issue) => (issue.pullRequestNumber === null ? <span className="subtle">—</span> : <span className="num">#{issue.pullRequestNumber}</span>),
    },
    { id: 'updated', header: 'Mis à jour', width: '96px', align: 'end', hideOnMobile: true, cell: (issue) => <span className="subtle num">{relativeTime(issue.updatedAt, now)}</span> },
  ];
  return (
    <DataTable
      label="Issues"
      rows={issues}
      columns={columns}
      rowKey={(issue) => String(issue.number)}
      onActivate={(issue) => void navigate(paths.issue(issue.number))}
      empty={<EmptyState compact title="Aucune issue dans ce groupe" />}
    />
  );
}
