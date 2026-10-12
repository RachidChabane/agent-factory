import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { CheckRunView, PullRequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { failsOnBaseToo } from '../../model/checks.ts';
import { Section } from '../../ui/components/Card.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import type { TableColumn } from '../../ui/components/Table.tsx';
import { DataTable } from '../../ui/components/Table.tsx';
import { ReadingView } from '../../widgets/ReadingView.tsx';
import { checkMark, hasDurations } from './pull-request-model.ts';

const MARK_SIZE = 13;
const LINK_ICON_SIZE = 13;

interface CheckRow {
  readonly position: number;
  readonly check: CheckRunView;
}

/** A check run whose failure the base branch shares is shown muted: it is a fact about the base, not about the change. */
function CheckCell({ check, children }: { readonly check: CheckRunView; readonly children: ReactNode }) {
  return <span className={failsOnBaseToo(check) ? 'pr-check--shared' : undefined}>{children}</span>;
}

function ChecksTable({ checks }: { readonly checks: readonly CheckRunView[] }) {
  const { t, fmt } = useI18n();
  const vocabulary = useVocabulary();
  const rows = checks.map((check, position): CheckRow => ({ position, check }));
  const columns: TableColumn<CheckRow>[] = [
    {
      id: 'name',
      header: t('pullRequests.checks.name'),
      primary: true,
      cell: ({ check }) => (
        <CheckCell check={check}>
          <span className="mono">{check.name}</span>
        </CheckCell>
      ),
    },
    {
      id: 'result',
      header: t('pullRequests.checks.result'),
      cell: ({ check }) => (
        <CheckCell check={check}>
          <span className="pr-check__result">
            <StatusMark mark={checkMark(check)} size={MARK_SIZE} label={vocabulary.checkConclusion(check.conclusion)} />
            <span>{vocabulary.checkConclusion(check.conclusion)}</span>
            {failsOnBaseToo(check) ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="pr-check__note">{t('pullRequests.checks.failsOnBase')}</span>
              </>
            ) : null}
          </span>
        </CheckCell>
      ),
    },
    ...(hasDurations(checks)
      ? [
          {
            id: 'duration',
            header: t('pullRequests.checks.duration'),
            align: 'end' as const,
            cell: ({ check }: CheckRow) => (
              <CheckCell check={check}>{check.durationMs === null ? <span className="subtle">{t('pullRequests.checks.noDuration')}</span> : <span className="num">{fmt.duration(check.durationMs)}</span>}</CheckCell>
            ),
          },
        ]
      : []),
    {
      id: 'run',
      header: t('pullRequests.checks.run'),
      cell: ({ check }) =>
        check.url.length === 0 ? (
          <span className="subtle">{t('pullRequests.checks.noLink')}</span>
        ) : (
          <a className="link pr-check__link" href={check.url} target="_blank" rel="noreferrer" aria-label={t('pullRequests.checks.openLabel', { name: check.name })}>
            {t('pullRequests.checks.open')}
            <ExternalLink size={LINK_ICON_SIZE} aria-hidden="true" />
          </a>
        ),
    },
  ];
  return <DataTable label={t('pullRequests.checks.table')} rows={rows} columns={columns} rowKey={({ position, check }) => `${position}:${check.name}`} dense />;
}

/** The check runs of the head commit, in each state the reading from the forge can be in. */
export function PullRequestChecks({ pullRequest }: { readonly pullRequest: PullRequestView }) {
  const { t } = useI18n();
  return (
    <Section title={t('pullRequests.checks.title')} id="pull-request-checks">
      <ReadingView
        reading={pullRequest.checks}
        kind="forge"
        notRead={pullRequest.state === 'open' ? t('pullRequests.checks.notReadOpen') : t('pullRequests.checks.notReadSettled')}
        isEmpty={(checks) => checks.length === 0}
        empty={t('pullRequests.checks.empty')}
      >
        {(checks) => <ChecksTable checks={checks} />}
      </ReadingView>
    </Section>
  );
}
