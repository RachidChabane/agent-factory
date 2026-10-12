import { Link } from 'react-router';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { DeliveredCommit } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { shortSha } from '../../model/identifiers.ts';
import { paths } from '../../model/routes.ts';
import { Time } from '../../widgets/Time.tsx';

/** The commits of a delivery, newest last as the repository lists them, each linked to the pull request and the issue it came from. */
export function CommitList({ commits }: { readonly commits: readonly DeliveredCommit[] }) {
  const { t } = useI18n();
  const project = useProject();
  return (
    <ul className="commit-list">
      {commits.map((commit) => (
        <li key={commit.sha} className="commit-list__item">
          <span className="commit-list__headline">
            {commit.pullRequestNumber === null ? (
              commit.headline
            ) : (
              <Link className="link" to={paths.pullRequest(project.id, commit.pullRequestNumber)}>
                {commit.headline}
              </Link>
            )}
          </span>
          <span className="commit-list__meta">
            <span className="mono">{shortSha(commit.sha)}</span>
            <span>{commit.author}</span>
            <Time iso={commit.committedAt} />
            {commit.issueNumber === null ? null : (
              <Link className="link" to={paths.issue(project.id, commit.issueNumber)}>
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
  /** The commits, none at all as an empty list, or null when they are not known. */
  readonly commits: readonly DeliveredCommit[] | null;
  /** Folds the list behind its count, as a table row does. */
  readonly folded?: boolean | undefined;
}

/** What a deployment brought: its commits, the statement that it brought none, or that nothing is known of them. */
export function DeliveredCommits({ commits, folded = false }: DeliveredCommitsProps) {
  const { t } = useI18n();
  if (commits === null) return <span className="subtle">{t('delivery.commits.unknown')}</span>;
  if (commits.length === 0) return <span className="subtle">{t('delivery.commits.none')}</span>;
  if (!folded) return <CommitList commits={commits} />;
  return (
    <details className="commit-disclosure">
      <summary>{t('delivery.commits.count', { count: commits.length })}</summary>
      <CommitList commits={commits} />
    </details>
  );
}
