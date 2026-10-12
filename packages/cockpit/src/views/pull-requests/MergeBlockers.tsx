import { CircleAlert } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';

const ICON_SIZE = 16;

interface MergeBlockersProps {
  readonly blockers: readonly string[];
  readonly id: string;
}

/** What stands between an open pull request and its merge, in the factory's own words. */
export function MergeBlockers({ blockers, id }: MergeBlockersProps) {
  const { t } = useI18n();
  return (
    <section className="callout callout--running" id={id} aria-label={t('pullRequests.blocked.title')}>
      <CircleAlert size={ICON_SIZE} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t('pullRequests.blocked.title')}</p>
        {blockers.length === 0 ? (
          <p>{t('pullRequests.blocked.noReason')}</p>
        ) : (
          <ul className="bullets" aria-label={t('pullRequests.blocked.list')}>
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
