import { Link } from 'react-router';
import { Ban, CircleAlert, Loader, MessageCircleQuestionMark } from 'lucide-react';
import { ISSUE_ABANDONED_STATE, ISSUE_ESCALATION_STATE } from '@agent-factory/domain';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { IssueView, RunView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { Time } from '../../widgets/Time.tsx';
import { liveRunsOfSubject, runToFollow } from './subject-runs.ts';

function Escalation({ issue }: { readonly issue: IssueView }) {
  const { t, rich } = useI18n();
  const vocabulary = useVocabulary();
  const { escalation, resumeTarget } = issue;
  const hasDiagnosis = escalation !== null && escalation.diagnosis.length > 0 && escalation.diagnosis !== escalation.reason;
  return (
    <section className="callout callout--failed" aria-label={t('issues.escalation.title')}>
      <CircleAlert size={16} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t('issues.escalation.title')}</p>
        <p className="issue-notice__text">{escalation === null || escalation.reason.length === 0 ? t('issues.escalation.noReason') : escalation.reason}</p>
        {hasDiagnosis ? <p className="issue-notice__text">{escalation.diagnosis}</p> : null}
        {escalation === null ? null : <p className="subtle">{rich('issues.escalation.since', { when: <Time iso={escalation.since} /> })}</p>}
        <p className="subtle">{resumeTarget === null ? t('issues.escalation.noResume') : t('issues.escalation.resumesAt', { state: vocabulary.issueState(resumeTarget) })}</p>
      </div>
    </section>
  );
}

function Abandoned() {
  const { t } = useI18n();
  return (
    <section className="callout" aria-label={t('issues.abandoned.title')}>
      <Ban size={16} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t('issues.abandoned.title')}</p>
        <p>{t('issues.abandoned.body')}</p>
      </div>
    </section>
  );
}

function LiveRun({ run }: { readonly run: RunView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const question = run.pendingQuestion;
  return (
    <Link to={paths.run(run.id)} className={`callout ${question === null ? 'callout--running' : 'callout--waiting'} issue-notice--link`}>
      {question === null ? <Loader size={16} aria-hidden="true" /> : <MessageCircleQuestionMark size={16} aria-hidden="true" />}
      <div className="callout__body">
        <p className="callout__title">{question === null ? t('issues.liveRun.title', { role: vocabulary.role(run.role) }) : t('issues.question.title')}</p>
        <p className="issue-notice__text">{question === null ? (run.lastLine ?? t('issues.liveRun.noOutput')) : question.text}</p>
        <span className="link">{question === null ? t('issues.liveRun.open', { run: run.id }) : t('issues.question.answer', { run: run.id })}</span>
      </div>
    </Link>
  );
}

export function IssueNotices({ issue }: { readonly issue: IssueView }) {
  const project = useProject();
  const { runs } = useSnapshot();
  const run = runToFollow(liveRunsOfSubject(runs, project.id, 'issue', String(issue.number)));
  return (
    <>
      {issue.state === ISSUE_ESCALATION_STATE ? <Escalation issue={issue} /> : null}
      {issue.state === ISSUE_ABANDONED_STATE ? <Abandoned /> : null}
      {run === null ? null : <LiveRun run={run} />}
    </>
  );
}
