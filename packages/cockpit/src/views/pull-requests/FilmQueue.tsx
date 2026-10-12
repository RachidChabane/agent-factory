import { CircleAlert, Loader } from 'lucide-react';
import type { FilmOrderView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { expectedArrival, type PendingFilmOrder } from './film-model.ts';

const ICON_SIZE = 16;

/** A film that waits for its turn or records now: where it stands, behind how many films, and when it is expected in the zone of the project's films. */
export function QueuedFilm({ order, timeZone }: { readonly order: PendingFilmOrder; readonly timeZone: string | null }) {
  const { t, fmt } = useI18n();
  const state = t(`pullRequests.films.state.${order.state}`);
  return (
    <section className="callout callout--running" aria-label={t('pullRequests.films.queueLabel', { scenario: order.scenario })}>
      <Loader size={ICON_SIZE} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t('pullRequests.films.queueTitle', { state, scenario: order.scenario })}</p>
        {order.state === 'queued' && order.filmsAhead > 0 ? <p>{t('pullRequests.films.ahead', { count: order.filmsAhead })}</p> : null}
        {order.expectedAt === null ? null : <p>{t('pullRequests.films.expected', { when: expectedArrival(fmt, order.expectedAt, timeZone) })}</p>}
        <p className="subtle">{t('pullRequests.films.orderedBy', { operator: order.operator })}</p>
      </div>
    </section>
  );
}

/** A film that failed: the reason the factory gave, and that it can be ordered again. */
export function FailedFilm({ order }: { readonly order: FilmOrderView }) {
  const { t } = useI18n();
  return (
    <section className="callout callout--failed" aria-label={t('pullRequests.films.failedLabel', { scenario: order.scenario })}>
      <CircleAlert size={ICON_SIZE} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t('pullRequests.films.failedTitle', { scenario: order.scenario })}</p>
        <p>{order.reason ?? t('pullRequests.films.failedNoReason')}</p>
      </div>
    </section>
  );
}
