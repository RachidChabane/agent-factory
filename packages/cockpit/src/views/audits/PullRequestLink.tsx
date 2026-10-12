import { Link } from 'react-router';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { pullRequestTarget } from './audit-links.ts';

interface PullRequestLinkProps {
  readonly number: number;
  /** The page the forge gives the pull request, when it gives one. */
  readonly url: string | null;
}

/** `PR #12`, as a link wherever there is somewhere to go. */
export function PullRequestLink({ number, url }: PullRequestLinkProps) {
  const { t } = useI18n();
  const project = useProject();
  const target = pullRequestTarget(project, number, url);
  const label = t('audits.pullRequest', { number });
  switch (target.kind) {
    case 'internal':
      return (
        <Link to={target.to} className="link num">
          {label}
        </Link>
      );
    case 'forge':
      return (
        <a className="link num" href={target.href} target="_blank" rel="noreferrer">
          {label}
        </a>
      );
    case 'unlinked':
      return <span className="num">{label}</span>;
  }
}
