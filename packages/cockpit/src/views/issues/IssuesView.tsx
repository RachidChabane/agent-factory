import './issues.css';
import { Link, useParams } from 'react-router';
import { CircleDot } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { paths } from '../../model/routes.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Page } from '../../ui/layout/Page.tsx';
import { IssueDetail } from './IssueDetail.tsx';
import { IssuesIndex } from './IssuesIndex.tsx';

function IssueNotFound({ number }: { readonly number: string }) {
  const { t } = useI18n();
  const project = useProject();
  return (
    <Page width="narrow">
      <EmptyState
        icon={<CircleDot size={16} />}
        headingLevel={1}
        title={t('issues.notFound', { number })}
        description={t('issues.notFoundDescription')}
        action={
          <Link to={paths.issues(project.id)} className="link">
            {t('issues.back')}
          </Link>
        }
      />
    </Page>
  );
}

export function IssuesView() {
  const { issueNumber } = useParams();
  const project = useProject();
  if (issueNumber === undefined) return <IssuesIndex key={project.id} />;
  const issue = project.issues.find((entry) => String(entry.number) === issueNumber);
  return issue === undefined ? <IssueNotFound number={issueNumber} /> : <IssueDetail key={`${project.id}:${issue.number}`} issue={issue} />;
}
