import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { IssueView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { issueMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import type { TableColumn } from '../../ui/components/Table.tsx';
import { DataTable } from '../../ui/components/Table.tsx';
import { Money } from '../../widgets/Money.tsx';
import { Time } from '../../widgets/Time.tsx';

const STATE_COLUMN_WIDTH = '190px';
const TYPE_COLUMN_WIDTH = '130px';
const NUMBER_COLUMN_WIDTH = '72px';
const PULL_REQUEST_COLUMN_WIDTH = '120px';
const UPDATED_COLUMN_WIDTH = '110px';
const COST_COLUMN_WIDTH = '200px';

/** The link keeps its own destination: the row around it opens the issue, and must neither hijack the click nor the key. */
function keepOwnDestination(event: MouseEvent | KeyboardEvent): void {
  event.stopPropagation();
}

interface IssueTableProps {
  readonly issues: readonly IssueView[];
  readonly empty: ReactNode;
}

export function IssueTable({ issues, empty }: IssueTableProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const { costs } = useSnapshot();
  const navigate = useNavigate();
  const columns: readonly TableColumn<IssueView>[] = [
    { id: 'number', header: t('issues.column.number'), width: NUMBER_COLUMN_WIDTH, cell: (issue) => <span className="issue-table__number num">#{issue.number}</span> },
    {
      id: 'title',
      header: t('issues.column.title'),
      primary: true,
      cell: (issue) => (
        <span className="issue-table__title">
          <span className="truncate">{issue.title}</span>
          {issue.paused ? <Badge tone="idle">{t('issues.paused')}</Badge> : null}
        </span>
      ),
    },
    { id: 'type', header: t('issues.column.type'), width: TYPE_COLUMN_WIDTH, hideOnMobile: true, cell: (issue) => <Badge>{vocabulary.issueType(issue.type)}</Badge> },
    {
      id: 'state',
      header: t('issues.column.state'),
      width: STATE_COLUMN_WIDTH,
      cell: (issue) => (
        <span className="issue-table__state">
          <span aria-hidden="true">
            <StatusMark mark={issueMark(issue.state)} size={14} />
          </span>
          {vocabulary.issueState(issue.state)}
        </span>
      ),
    },
    {
      id: 'pullRequest',
      header: t('issues.column.pullRequest'),
      width: PULL_REQUEST_COLUMN_WIDTH,
      hideOnMobile: true,
      cell: (issue) =>
        issue.pullRequestNumber === null ? (
          <span className="subtle">{t('issues.noPullRequest')}</span>
        ) : (
          <Link to={paths.pullRequest(project.id, issue.pullRequestNumber)} className="link num" onClick={keepOwnDestination} onKeyDown={keepOwnDestination}>
            {t('issues.pullRequest', { number: issue.pullRequestNumber })}
          </Link>
        ),
    },
    { id: 'updated', header: t('issues.column.updated'), width: UPDATED_COLUMN_WIDTH, hideOnMobile: true, cell: (issue) => <Time iso={issue.updatedAt} className="subtle num" /> },
    { id: 'cost', header: t('issues.column.cost'), width: COST_COLUMN_WIDTH, align: 'end', hideOnMobile: true, cell: (issue) => <Money amount={issue.costUsd} basis={costs.basis} /> },
  ];
  return (
    <DataTable
      label={t('issues.table.label')}
      rows={issues}
      columns={columns}
      rowKey={(issue) => String(issue.number)}
      onActivate={(issue) => void navigate(paths.issue(project.id, issue.number))}
      empty={empty}
    />
  );
}
