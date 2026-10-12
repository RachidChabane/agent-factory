import { Link } from 'react-router';
import { useNow } from '../../app/context.tsx';
import type { Attempt, IssueView } from '../../contract/index.ts';
import { toEpoch } from '../../i18n/formatters.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { attemptMark } from './issue-model.ts';

/** The index counts from zero on the factory's side; people count attempts from one. */
const FIRST_ATTEMPT_NUMBER = 1;

function AttemptMeta({ attempt }: { readonly attempt: Attempt }) {
  const { t, fmt } = useI18n();
  const vocabulary = useVocabulary();
  const now = useNow();
  const duration =
    attempt.endedAt === null
      ? t('issues.attempts.runningFor', { duration: fmt.elapsedSince(attempt.startedAt, now) })
      : fmt.duration(toEpoch(attempt.endedAt) - toEpoch(attempt.startedAt));
  return (
    <p className="attempt__meta">
      <span className="mono">{attempt.model}</span> · {t('issues.attempts.effort', { effort: vocabulary.effort(attempt.effort) })} · {duration} ·{' '}
      {attempt.runId.length === 0 ? (
        <span>{t('issues.attempts.noRun')}</span>
      ) : (
        <Link to={paths.run(attempt.runId)} className="link">
          {attempt.runId}
        </Link>
      )}
    </p>
  );
}

function AttemptSummary({ attempt }: { readonly attempt: Attempt }) {
  const { t } = useI18n();
  if (attempt.summary.length > 0) return <p className="attempt__summary">{attempt.summary}</p>;
  return attempt.outcome === 'running' ? null : <p className="attempt__summary subtle">{t('issues.attempts.noSummary')}</p>;
}

function AttemptItem({ attempt }: { readonly attempt: Attempt }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const mark = attemptMark(attempt.outcome);
  return (
    <li className="attempt">
      <span className={`attempt__dot attempt__dot--${mark}`} aria-hidden="true" />
      <div className="attempt__body">
        <p className="attempt__title">
          <span>{t('issues.attempts.heading', { number: attempt.index + FIRST_ATTEMPT_NUMBER, kind: vocabulary.attemptKind(attempt.kind) })}</span>
          <Badge tone={mark}>{vocabulary.attemptOutcome(attempt.outcome)}</Badge>
        </p>
        <AttemptSummary attempt={attempt} />
        <AttemptMeta attempt={attempt} />
      </div>
    </li>
  );
}

export function IssueAttempts({ issue }: { readonly issue: IssueView }) {
  const { t } = useI18n();
  return (
    <Section title={t('issues.attempts.title')} id="issue-attempts" description={t('issues.attempts.description')}>
      {issue.attempts.length === 0 ? (
        <EmptyState compact title={t('issues.attempts.none')} description={t('issues.attempts.noneDescription')} />
      ) : (
        <ol className="attempts" aria-label={t('issues.attempts.list')}>
          {issue.attempts.map((attempt) => (
            <AttemptItem key={`${attempt.index}-${attempt.runId}`} attempt={attempt} />
          ))}
        </ol>
      )}
    </Section>
  );
}
