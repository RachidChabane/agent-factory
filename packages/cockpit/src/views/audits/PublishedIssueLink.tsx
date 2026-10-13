import { Link } from 'react-router';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { publishedIssueTarget } from './audit-links.ts';

interface PublishedIssueLinkProps {
  readonly number: number;
  /** The page the forge gives the issue, when it gives one. */
  readonly url: string | null;
}

/** `Published as issue #12`, as a link wherever there is somewhere to go: the factory's page for the issue, or the forge's. */
export function PublishedIssueLink({ number, url }: PublishedIssueLinkProps) {
  const { t } = useI18n();
  const project = useProject();
  const label = t('audits.draft.published', { number });
  const target = publishedIssueTarget(project, number, url);
  switch (target.kind) {
    case 'internal':
      return (
        <Link to={target.to} className="link">
          {label}
        </Link>
      );
    case 'forge':
      return (
        <a className="link" href={target.href} target="_blank" rel="noreferrer">
          {label}
        </a>
      );
    case 'unlinked':
      return <span>{label}</span>;
  }
}
