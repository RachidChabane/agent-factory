import './issue-detail.css';
import { ISSUE_ABANDONED_STATE } from '@agent-factory/domain';
import type { IssueView } from '../../contract/index.ts';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { issueMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { DelegatedMarks } from '../../widgets/DelegatedMarks.tsx';
import { DetailHeader } from '../../ui/layout/Page.tsx';
import { IssueActions } from './IssueActions.tsx';
import { IssueAttempts } from './IssueAttempts.tsx';
import { IssueChecks } from './IssueChecks.tsx';
import { IssueCost } from './IssueCost.tsx';
import { IssueDependencies } from './IssueDependencies.tsx';
import { IssueMeta } from './IssueMeta.tsx';
import { IssueNotices } from './IssueNotices.tsx';
import { IssuePipeline } from './IssuePipeline.tsx';
import { SpecContent } from './SpecContent.tsx';

export function IssueDetail({ issue }: { readonly issue: IssueView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  return (
    <article className="detail">
      <DetailHeader
        back={{ to: paths.issues(project.id), label: t('issues.back') }}
        eyebrow={
          <>
            <StatusMark mark={issueMark(issue.state)} />
            <span>{vocabulary.issueState(issue.state)}</span>
            <Badge>{vocabulary.issueType(issue.type)}</Badge>
            {issue.paused ? <Badge tone="idle">{t('issues.paused')}</Badge> : null}
            <span className="num">#{issue.number}</span>
          </>
        }
        title={issue.title}
        actions={<IssueActions issue={issue} />}
        meta={<IssueMeta issue={issue} />}
      />
      <IssueNotices issue={issue} />
      <DelegatedMarks decisions={issue.delegated} />
      {issue.state === ISSUE_ABANDONED_STATE ? null : <IssuePipeline issue={issue} />}
      <div className="issue-detail__grid">
        <Section title={t('issues.spec.title')} id="issue-spec">
          <SpecContent spec={issue.spec} />
        </Section>
        <IssueDependencies issue={issue} />
      </div>
      <IssueChecks issue={issue} />
      <IssueAttempts issue={issue} />
      <IssueCost issue={issue} />
    </article>
  );
}
