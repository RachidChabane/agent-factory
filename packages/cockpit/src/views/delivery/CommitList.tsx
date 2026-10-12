import './commit-list.css';
import { Link } from 'react-router';
import type { DeliveredCommit } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { shortSha } from '../../model/identifiers.ts';
import { paths } from '../../model/routes.ts';
import { Time } from '../../widgets/Time.tsx';

/** The commits of a delivery, newest last as the repository lists them, each linked to the pull request and the issue it came from. */
export function CommitList({ project, commits }: { readonly project: string; readonly commits: readonly DeliveredCommit[] }) {
  const { t } = useI18n();
  return (
    <ul className="commit-list">
      {commits.map((commit) => (
        <li key={commit.sha} className="commit-list__item">
          <span className="commit-list__headline">
            {commit.pullRequestNumber === null ? (
              commit.headline
            ) : (
              <Link className="link" to={paths.pullRequest(project, commit.pullRequestNumber)}>
                {commit.headline}
              </Link>
            )}
          </span>
          <span className="commit-list__meta">
            <span className="mono">{shortSha(commit.sha)}</span>
            <span>{commit.author}</span>
            <Time iso={commit.committedAt} />
            {commit.issueNumber === null ? null : (
              <Link className="link" to={paths.issue(project, commit.issueNumber)}>
                {t('delivery.commits.issue', { number: commit.issueNumber })}
              </Link>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface DeliveredCommitsProps {
  /** The project the commits belong to, whose pull requests and issues they link to. */
  readonly project: string;
  /** The commits, none at all as an empty list, or null when they are not known. */
  readonly commits: readonly DeliveredCommit[] | null;
  /** Folds the list behind its count, as a table row does. */
  readonly folded?: boolean | undefined;
}

/** That nothing is known of the commits, in full, or in a word with the full statement as its title where a table row has no room for it. */
function UnknownCommits({ folded }: { readonly folded: boolean }) {
  const { t } = useI18n();
  const statement = t('delivery.commits.unknown');
  if (!folded) return <span className="subtle">{statement}</span>;
  return (
    <span className="subtle commit-note" title={statement}>
      {t('delivery.commits.unknown.short')}
    </span>
  );
}

/** What a deployment brought: its commits, the statement that it brought none, or that nothing is known of them. */
export function DeliveredCommits({ project, commits, folded = false }: DeliveredCommitsProps) {
  const { t } = useI18n();
  if (commits === null) return <UnknownCommits folded={folded} />;
  if (commits.length === 0) return <span className="subtle commit-note">{t('delivery.commits.none')}</span>;
  if (!folded) return <CommitList project={project} commits={commits} />;
  return (
    <details className="commit-disclosure">
      <summary>{t('delivery.commits.count', { count: commits.length })}</summary>
      <CommitList project={project} commits={commits} />
    </details>
  );
}
