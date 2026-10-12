import { Link } from 'react-router';
import { Film } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { paths } from '../../model/routes.ts';
import { Time } from '../../widgets/Time.tsx';
import type { ChangedPullRequest } from './changes-model.ts';
import { PULL_REQUEST_EVENT_KINDS } from './changes-model.ts';

const STATE_TONES = { open: 'running', merged: 'success', closed: 'blocked' } as const;
const FILM_ICON_SIZE = 12;

interface PullRequestLaneProps {
  readonly project: string;
  readonly pullRequests: readonly ChangedPullRequest[];
}

/** The pull requests of a project that moved during the period, and what happened to each. */
export function PullRequestLane({ project, pullRequests }: PullRequestLaneProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <section className="changes-lane" aria-label={t('changes.pullRequests.lane')}>
      <header className="changes-lane__header">
        <h3 className="changes-lane__name">{t('changes.pullRequests.title')}</h3>
        <span className="changes-lane__count num">{pullRequests.length}</span>
      </header>
      {pullRequests.length === 0 ? (
        <Card>
          <EmptyState compact title={t('changes.pullRequests.empty')} />
        </Card>
      ) : (
        <ul className="changes-lane__list">
          {pullRequests.map((pullRequest) => (
            <li key={pullRequest.number}>
              <Card className="changes-item">
                <Link className="link changes-item__title" to={pullRequest.detailPath}>
                  #{pullRequest.number} · {pullRequest.title}
                </Link>
                <div className="changes-item__badges">
                  <Badge tone={STATE_TONES[pullRequest.state]}>{vocabulary.pullRequestState(pullRequest.state)}</Badge>
                  <Badge>{pullRequest.typeLabel}</Badge>
                  {pullRequest.hasFilms ? (
                    <Badge tone="accent" icon={<Film size={FILM_ICON_SIZE} aria-hidden="true" />}>
                      {t('changes.pullRequests.films')}
                    </Badge>
                  ) : null}
                </div>
                <p className="changes-item__meta">
                  <Link className="link" to={paths.issue(project, pullRequest.issueNumber)}>
                    {t('changes.issue', { number: pullRequest.issueNumber })}
                  </Link>
                  {' · '}
                  {PULL_REQUEST_EVENT_KINDS.filter((kind) => pullRequest.events.some((event) => event.kind === kind))
                    .map((kind) => t(`changes.event.${kind}`))
                    .join(' · ')}
                  {' · '}
                  <Time iso={pullRequest.lastEventAt} className="num" />
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
