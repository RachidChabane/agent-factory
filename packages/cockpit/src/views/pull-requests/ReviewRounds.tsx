import { Link } from 'react-router';
import type { ReviewFindingView, ReviewRound } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Time } from '../../widgets/Time.tsx';
import { findingLocation, latestRoundFirst, unresolvedCount } from './pull-request-model.ts';

function Finding({ finding }: { readonly finding: ReviewFindingView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const location = findingLocation(finding);
  return (
    <li className={`review-finding${finding.resolved ? ' is-resolved' : ''}`}>
      <div className="review-finding__tags">
        <Badge tone={finding.severity === 'blocking' ? 'failed' : 'neutral'}>{vocabulary.reviewSeverity(finding.severity)}</Badge>
        <span className="review-finding__category">{vocabulary.reviewCategory(finding.category)}</span>
        <Badge tone={finding.resolved ? 'success' : 'waiting'}>{finding.resolved ? t('pullRequests.review.resolved') : t('pullRequests.review.unresolvedBadge')}</Badge>
      </div>
      <p className="review-finding__summary">{finding.summary}</p>
      {location === null ? <p className="review-finding__location subtle">{t('pullRequests.review.noFile')}</p> : <p className="review-finding__location mono">{location}</p>}
    </li>
  );
}

function RoundTally({ round }: { readonly round: ReviewRound }) {
  const { t } = useI18n();
  const unresolved = unresolvedCount(round);
  if (round.findings.length === 0) return <Badge tone="success">{t('pullRequests.review.noFinding')}</Badge>;
  return (
    <>
      <Badge>{t('pullRequests.review.findings', { count: round.findings.length })}</Badge>
      {unresolved === 0 ? null : <Badge tone="waiting">{t('pullRequests.review.unresolved', { count: unresolved })}</Badge>}
    </>
  );
}

function ReviewRoundItem({ round }: { readonly round: ReviewRound }) {
  const { t, rich } = useI18n();
  return (
    <li className="review-round">
      <header className="review-round__header">
        <span className="review-round__title">{t('pullRequests.review.round', { number: round.round })}</span>
        <span className="review-round__meta">
          {round.runId.length === 0 ? null : (
            <>
              <Link to={paths.run(round.runId)} className="link mono" aria-label={t('pullRequests.review.openRun', { run: round.runId })}>
                {round.runId}
              </Link>{' '}
              ·{' '}
            </>
          )}
          {rich('pullRequests.review.completed', { when: <Time iso={round.completedAt} /> })}
        </span>
        <RoundTally round={round} />
      </header>
      {round.findings.length === 0 ? null : (
        <ul className="review-findings" aria-label={t('pullRequests.review.findingList', { number: round.round })}>
          {round.findings.map((finding, position) => (
            <Finding key={`${position}-${finding.summary}`} finding={finding} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ReviewRounds({ rounds }: { readonly rounds: readonly ReviewRound[] }) {
  const { t } = useI18n();
  return (
    <Section title={t('pullRequests.review.title')} id="pull-request-review" description={t('pullRequests.review.description')}>
      {rounds.length === 0 ? (
        <EmptyState compact title={t('pullRequests.review.none')} description={t('pullRequests.review.noneDescription')} />
      ) : (
        <ol className="review-rounds" aria-label={t('pullRequests.review.list')}>
          {latestRoundFirst(rounds).map((round) => (
            <ReviewRoundItem key={`${round.round}-${round.runId}`} round={round} />
          ))}
        </ol>
      )}
    </Section>
  );
}
