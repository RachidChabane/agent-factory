import { CircleAlert } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';

const ICON_SIZE = 16;
const ID_SEPARATOR = ' ';

interface MergeBlockersProps {
  readonly blockers: readonly string[];
  /** What the ids of the reasons start with. */
  readonly id: string;
}

function reasonId(id: string, position: number): string {
  return `${id}-reason-${position}`;
}

/**
 * The ids of the elements that state why the merge is blocked, for the button of the merge to point at: a browser
 * reads the text of the elements a description points at, but only the label of a callout that has one.
 */
export function mergeBlockerIds(id: string, blockers: readonly string[]): string {
  return (blockers.length === 0 ? [0] : blockers.map((_, position) => position)).map((position) => reasonId(id, position)).join(ID_SEPARATOR);
}

/** What stands between an open pull request and its merge, in the factory's own words. */
export function MergeBlockers({ blockers, id }: MergeBlockersProps) {
  const { t } = useI18n();
  return (
    <section className="callout callout--running" aria-label={t('pullRequests.blocked.title')}>
      <CircleAlert size={ICON_SIZE} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t('pullRequests.blocked.title')}</p>
        {blockers.length === 0 ? (
          <p id={reasonId(id, 0)}>{t('pullRequests.blocked.noReason')}</p>
        ) : (
          <ul className="bullets" aria-label={t('pullRequests.blocked.list')}>
            {blockers.map((blocker, position) => (
              <li key={blocker} id={reasonId(id, position)}>
                {blocker}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
