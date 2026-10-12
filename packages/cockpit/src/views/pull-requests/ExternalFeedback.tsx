import { Info } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { ExternalFeedback as ExternalFeedbackRecord, PullRequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { Time } from '../../widgets/Time.tsx';
import { FeedbackForm } from './FeedbackForm.tsx';
import type { FeedbackAvailability } from './pull-request-model.ts';
import { feedbackAvailability } from './pull-request-model.ts';

const NOTE_ICON_SIZE = 14;

function FeedbackList({ feedback }: { readonly feedback: readonly ExternalFeedbackRecord[] }) {
  const { t } = useI18n();
  if (feedback.length === 0) return <p className="feedback__empty">{t('pullRequests.feedback.none')}</p>;
  return (
    <ul className="feedback__list" aria-label={t('pullRequests.feedback.list')}>
      {feedback.map((entry) => (
        <li key={entry.id} className="feedback__item">
          <p className="feedback__meta">
            <strong>{entry.author}</strong>
            <span>{entry.source}</span>
            <Time iso={entry.receivedAt} />
            {entry.cycleStarted ? <Badge tone="accent">{t('pullRequests.feedback.cycleStarted')}</Badge> : <Badge>{t('pullRequests.feedback.noCycle')}</Badge>}
          </p>
          <p className="feedback__body">{entry.body}</p>
        </li>
      ))}
    </ul>
  );
}

function FeedbackAccess({ availability, pullRequest }: { readonly availability: FeedbackAvailability; readonly pullRequest: PullRequestView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  switch (availability.kind) {
    case 'open':
      return <FeedbackForm pullRequest={pullRequest} />;
    case 'pull-request-settled':
      return (
        <p className="feedback__note">
          <Info size={NOTE_ICON_SIZE} aria-hidden="true" />
          {t('pullRequests.feedback.settled', { state: vocabulary.pullRequestState(availability.state).toLowerCase() })}
        </p>
      );
    case 'issue-not-awaiting-review':
      return (
        <p className="feedback__note">
          <Info size={NOTE_ICON_SIZE} aria-hidden="true" />
          {t('pullRequests.feedback.notAwaitingReview', { number: availability.issueNumber, state: vocabulary.issueState(availability.issueState) })}
        </p>
      );
  }
}

/** What people outside the factory said about the pull request, and the way to pass more on while the factory can still act on it. */
export function ExternalFeedback({ pullRequest }: { readonly pullRequest: PullRequestView }) {
  const { t } = useI18n();
  const { issues } = useProject();
  return (
    <Section title={t('pullRequests.feedback.title')} id="pull-request-feedback" description={t('pullRequests.feedback.description')}>
      <div className="feedback">
        <FeedbackList feedback={pullRequest.externalFeedback} />
        <FeedbackAccess availability={feedbackAvailability(pullRequest, issues)} pullRequest={pullRequest} />
      </div>
    </Section>
  );
}
