import { Link } from 'react-router';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { RequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { issueMark } from '../../model/status.ts';
import { Section } from '../../ui/components/Card.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';

export function CreatedIssues({ request }: { readonly request: RequestView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  if (request.issueNumbers.length === 0) return null;
  return (
    <Section title={t('requests.issues.title')} id="request-issues">
      <ul className="request-issues" aria-label={t('requests.issues.list')}>
        {request.issueNumbers.map((number) => {
          const issue = project.issues.find((entry) => entry.number === number);
          return (
            <li key={number}>
              {issue === undefined ? (
                <span className="request-issue request-issue--missing">
                  <span className="num subtle">#{number}</span>
                  <span className="truncate">{t('requests.issues.missing')}</span>
                </span>
              ) : (
                <Link to={paths.issue(project.id, issue.number)} className="request-issue">
                  <span aria-hidden="true">
                    <StatusMark mark={issueMark(issue.state)} size={14} />
                  </span>
                  <span className="num subtle">#{issue.number}</span>
                  <span className="truncate">{issue.title}</span>
                  <span className="request-issue__state">{vocabulary.issueState(issue.state)}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
