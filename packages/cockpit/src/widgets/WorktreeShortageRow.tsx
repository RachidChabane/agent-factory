import { Link } from 'react-router';
import type { WorktreeHolderView, WorktreeShortageView } from '../contract/index.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { useVocabulary } from '../i18n/vocabulary.ts';
import { paths } from '../model/routes.ts';
import { Badge } from '../ui/components/Badge.tsx';
import { Time } from './Time.tsx';

const HOLDER_SEPARATOR = ' · ';

function Holder({ project, holder }: { readonly project: string; readonly holder: WorktreeHolderView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <li className="worktree-shortage__holder">
      <Link to={paths.issue(project, holder.issueNumber)} className="link">
        {t('board.card.issue', { number: holder.issueNumber })}
      </Link>
      {holder.pullRequestNumber === null ? null : (
        <>
          {HOLDER_SEPARATOR}
          <Link to={paths.pullRequest(project, holder.pullRequestNumber)} className="link">
            {t('pause.worktrees.pullRequest', { number: holder.pullRequestNumber })}
          </Link>
        </>
      )}
      {holder.state === null ? null : <span className="subtle">{`${HOLDER_SEPARATOR}${vocabulary.issueState(holder.state)}`}</span>}
    </li>
  );
}

interface WorktreeShortageRowProps {
  readonly project: string;
  readonly shortage: WorktreeShortageView;
}

/** Validated issues that wait because every worktree of a project's pool is held, and who holds them. */
export function WorktreeShortageRow({ project, shortage }: WorktreeShortageRowProps) {
  const { t, rich } = useI18n();
  return (
    <li className="pause-row worktree-shortage">
      <Badge tone="waiting">{t('pause.worktrees.badge')}</Badge>
      <div className="pause-row__body">
        <p className="pause-row__reason">
          {t('pause.worktrees.waiting', { count: shortage.waiting.length })}{' '}
          {shortage.waiting.map((issueNumber, position) => (
            <span key={issueNumber}>
              {position === 0 ? null : ', '}
              <Link to={paths.issue(project, issueNumber)} className="link">{`#${issueNumber}`}</Link>
            </span>
          ))}
        </p>
        <p className="pause-row__reason">{t('pause.worktrees.held', { count: shortage.poolSize })}</p>
        <ul className="worktree-shortage__holders" aria-label={t('pause.worktrees.holders')}>
          {shortage.holders.map((holder) => (
            <Holder key={holder.issueNumber} project={project} holder={holder} />
          ))}
        </ul>
        <p className="pause-row__meta">
          <span>{rich('pause.worktrees.since', { age: <Time iso={shortage.since} /> })}</span>
          <span>{t('pause.worktrees.remedy')}</span>
        </p>
      </div>
    </li>
  );
}
