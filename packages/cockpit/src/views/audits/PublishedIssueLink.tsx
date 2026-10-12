import { Link } from 'react-router';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { publishedIssueTarget } from './audit-links.ts';

/** `Published as issue #12`, as a link when the factory lists that issue. */
export function PublishedIssueLink({ number }: { readonly number: number }) {
  const { t } = useI18n();
  const project = useProject();
  const label = t('audits.draft.published', { number });
  const target = publishedIssueTarget(project, number);
  return target.kind === 'internal' ? (
    <Link to={target.to} className="link">
      {label}
    </Link>
  ) : (
    <span>{label}</span>
  );
}
