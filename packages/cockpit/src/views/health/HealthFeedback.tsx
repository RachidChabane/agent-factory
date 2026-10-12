import { MessageSquare, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { HealthEnvironment } from '../../contract/index.ts';
import { integer, relativeTime } from '../../format/format.ts';
import { Card } from '../../ui/components/Card.tsx';
import { Meter } from '../../ui/components/Charts.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { formatRatio, satisfactionRatio } from './health-metrics.ts';

const NO_COMMENT = 'Sans commentaire';

interface HealthFeedbackProps {
  readonly feedback: HealthEnvironment['feedback'];
  readonly now: number;
}

export function HealthFeedback({ feedback, now }: HealthFeedbackProps) {
  const ratio = satisfactionRatio(feedback.positive, feedback.negative);
  const total = feedback.positive + feedback.negative;
  return (
    <Card className="health-feedback">
      {total === 0 ? (
        <EmptyState compact icon={<MessageSquare size={16} />} title="Aucun retour" description="Les retours des utilisateurs apparaîtront ici." />
      ) : (
        <div className="health-feedback__summary">
          <div className="health-feedback__counts">
            <span className="health-feedback__count">
              <ThumbsUp size={15} className="health-feedback__icon is-up" aria-hidden="true" />
              <span className="num">{integer(feedback.positive)}</span>
              <span className="health-feedback__caption">positifs</span>
            </span>
            <span className="health-feedback__count">
              <ThumbsDown size={15} className="health-feedback__icon is-down" aria-hidden="true" />
              <span className="num">{integer(feedback.negative)}</span>
              <span className="health-feedback__caption">négatifs</span>
            </span>
            <span className="health-feedback__ratio num">{formatRatio(ratio)} de satisfaction</span>
          </div>
          <Meter value={ratio} label="Satisfaction des utilisateurs" valueText={`${formatRatio(ratio)} de retours positifs`} tone="success" />
        </div>
      )}
      {feedback.recent.length === 0 ? null : (
        <ul className="health-feedback__list" aria-label="Retours récents">
          {feedback.recent.map((entry) => (
            <li key={entry.id} className="health-feedback__item">
              {entry.rating === 'up' ? (
                <ThumbsUp size={14} className="health-feedback__icon is-up" aria-label="Retour positif" role="img" />
              ) : (
                <ThumbsDown size={14} className="health-feedback__icon is-down" aria-label="Retour négatif" role="img" />
              )}
              <span className={entry.comment === '' ? 'health-feedback__comment is-empty' : 'health-feedback__comment'}>
                {entry.comment === '' ? NO_COMMENT : entry.comment}
              </span>
              <time className="health-feedback__time num" dateTime={entry.at}>
                {relativeTime(entry.at, now)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
