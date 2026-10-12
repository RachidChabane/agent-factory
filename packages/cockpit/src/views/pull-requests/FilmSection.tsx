import { useState } from 'react';
import { Clapperboard } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { PullRequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { ReadStamp } from '../../widgets/ReadStamp.tsx';
import { FilmCard } from './FilmCard.tsx';
import { FilmOrderDialog } from './FilmOrderDialog.tsx';
import { FailedFilm, QueuedFilm } from './FilmQueue.tsx';
import { canOrderFilm, failedFilms, filmTimeZone, isRecorded, pendingFilms } from './film-model.ts';

const ICON_SIZE = 14;
const SECTION_ID = 'pull-request-films';

/** The videos of a pull request: the queue and the failures, then each recorded scenario, and the form that orders another. */
export function FilmSection({ pullRequest }: { readonly pullRequest: PullRequestView }) {
  const { t } = useI18n();
  const project = useProject();
  const { generatedAt } = useSnapshot();
  const [ordering, setOrdering] = useState(false);
  const orderable = canOrderFilm(project, pullRequest);
  const pending = pendingFilms(pullRequest);
  const failed = failedFilms(pullRequest).filter((order) => !isRecorded(pullRequest, order.scenario));
  return (
    <Section
      title={t('pullRequests.films.title')}
      id={SECTION_ID}
      description={t('pullRequests.films.description')}
      actions={
        orderable ? (
          <Button variant="secondary" icon={<Clapperboard size={ICON_SIZE} />} onClick={() => setOrdering(true)}>
            {t('pullRequests.films.order.action')}
          </Button>
        ) : undefined
      }
    >
      {pending.length === 0 ? null : <ReadStamp readAt={generatedAt} kind="resources" neverLabel={t('pullRequests.films.queueNeverRead')} />}
      {pending.map((order) => (
        <QueuedFilm key={order.scenario} order={order} timeZone={filmTimeZone(project)} />
      ))}
      {failed.map((order) => (
        <FailedFilm key={order.scenario} order={order} />
      ))}
      {pullRequest.films.length === 0 ? <EmptyState compact title={t('pullRequests.films.none')} /> : pullRequest.films.map((film) => <FilmCard key={film.scenario} film={film} />)}
      {ordering && orderable ? <FilmOrderDialog pullRequest={pullRequest} onClose={() => setOrdering(false)} /> : null}
    </Section>
  );
}
