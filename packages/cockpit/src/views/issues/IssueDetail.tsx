import { Link } from 'react-router';
import type { BaseExpectation } from '@agent-factory/domain';
import { CircleAlert, ExternalLink, FileLock2, GitBranch, GitPullRequest, Inbox, Lock, MessageCircleQuestionMark } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import type { CockpitSnapshot, IssueView } from '../../contract/index.ts';
import { dateTime, duration, relativeTime, shortSha, toEpoch } from '../../format/format.ts';
import {
  ATTEMPT_KIND_LABELS,
  ATTEMPT_OUTCOME_LABELS,
  BEFORE_PROOF_KIND_LABELS,
  BEFORE_RESULT_LABELS,
  CHECK_KIND_LABELS,
  EFFORT_LABELS,
  ISSUE_STATE_LABELS,
  issueTypeLabel,
} from '../../i18n/labels.ts';
import { paths, VIEW_PATHS } from '../../model/routes.ts';
import { issueMark } from '../../model/status.ts';
import { Badge, type BadgeTone } from '../../ui/components/Badge.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { DetailHeader, MetaItem } from '../../ui/layout/Page.tsx';
import { IssueActions } from './IssueActions.tsx';
import { dependents, PIPELINE_STAGES, pipelineStageIndex } from './issue-model.ts';

const ATTEMPT_TONES = { running: 'running', passed: 'success', 'gate-failed': 'failed', 'review-failed': 'failed', error: 'failed' } as const;
const BEFORE_TONES = { failed: 'success', passed: 'failed', scored: 'accent', 'not-run': 'idle' } as const;
const EXPECTED_ON_BASE: Readonly<Record<BaseExpectation, IssueView['checks'][number]['before']['result']>> = { fails: 'failed', passes: 'passed' };

function beforeTone(check: IssueView['checks'][number]): BadgeTone {
  if (check.onBase === null) return BEFORE_TONES[check.before.result];
  if (check.before.result === 'scored' || check.before.result === 'not-run') return BEFORE_TONES[check.before.result];
  return EXPECTED_ON_BASE[check.onBase] === check.before.result ? 'success' : 'failed';
}

function PipelineStepper({ issue }: { readonly issue: IssueView }) {
  const target = issue.state === 'needs-human' ? (issue.resumeTarget ?? issue.state) : issue.state;
  const current = pipelineStageIndex(target);
  return (
    <ol className="pipeline" aria-label="Avancement dans la chaîne">
      {PIPELINE_STAGES.map((stage, index) => {
        const status = index < current ? 'done' : index === current ? (issue.state === 'needs-human' ? 'stuck' : 'current') : 'todo';
        return (
          <li key={stage.label} className={`pipeline__stage pipeline__stage--${status}`} aria-current={index === current ? 'step' : undefined}>
            <span className="pipeline__dot" aria-hidden="true" />
            <span className="pipeline__label">{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function DependencyList({ title, issues }: { readonly title: string; readonly issues: readonly IssueView[] }) {
  return (
    <div className="issue-deps__group">
      <p className="small-caps">{title}</p>
      {issues.length === 0 ? (
        <p className="subtle issue-deps__none">Aucune</p>
      ) : (
        <ul className="issue-deps__list">
          {issues.map((dependency) => (
            <li key={dependency.number}>
              <Link to={paths.issue(dependency.number)} className="issue-deps__item">
                <StatusMark mark={issueMark(dependency.state)} size={14} />
                <span className="num subtle">#{dependency.number}</span>
                <span className="truncate">{dependency.title}</span>
                <span className="issue-deps__state">{ISSUE_STATE_LABELS[dependency.state]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IssueDetail({ issue, snapshot }: { readonly issue: IssueView; readonly snapshot: CockpitSnapshot }) {
  const now = useNow();
  const upstream = snapshot.issues.filter((entry) => issue.dependsOn.includes(entry.number));
  const downstream = dependents(issue, snapshot.issues);
  const request = issue.requestId === null ? undefined : snapshot.requests.find((entry) => entry.id === issue.requestId);
  const waitingRun = snapshot.runs.find((run) => run.subject.kind === 'issue' && run.subject.id === String(issue.number) && run.pendingQuestion !== null);
  return (
    <article className="detail issue-detail">
      <DetailHeader
        back={{ to: VIEW_PATHS.issues, label: 'Toutes les issues' }}
        eyebrow={
          <>
            <StatusMark mark={issueMark(issue.state)} />
            <span>{ISSUE_STATE_LABELS[issue.state]}</span>
            <Badge>{issueTypeLabel(issue.type)}</Badge>
            {issue.paused ? <Badge tone="idle">en pause</Badge> : null}
            <span className="num">#{issue.number}</span>
          </>
        }
        title={issue.title}
        actions={<IssueActions issue={issue} issues={snapshot.issues} />}
        meta={
          <>
            {request === undefined ? null : (
              <MetaItem icon={<Inbox size={13} />}>
                <Link to={paths.request(request.id)} className="link">
                  {request.id} · {request.title}
                </Link>
              </MetaItem>
            )}
            {issue.branch === null ? null : (
              <MetaItem icon={<GitBranch size={13} />}>
                <span className="mono truncate">{issue.branch}</span>
              </MetaItem>
            )}
            {issue.pullRequestNumber === null ? null : (
              <MetaItem icon={<GitPullRequest size={13} />}>
                <Link to={paths.pullRequest(issue.pullRequestNumber)} className="link">
                  PR #{issue.pullRequestNumber}
                </Link>
              </MetaItem>
            )}
            <MetaItem>mise à jour il y a {relativeTime(issue.updatedAt, now)}</MetaItem>
            <MetaItem icon={<ExternalLink size={13} />}>
              <a href={issue.url} target="_blank" rel="noreferrer" className="link">
                GitHub
              </a>
            </MetaItem>
          </>
        }
      />

      <PipelineStepper issue={issue} />

      {issue.escalation === null ? null : (
        <section className="callout callout--failed" aria-label="Escalade">
          <CircleAlert size={16} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">Intervention requise depuis {relativeTime(issue.escalation.since, now)}</p>
            <p className="issue-escalation__reason">{issue.escalation.reason}</p>
            {issue.escalation.diagnosis === issue.escalation.reason ? null : <p>{issue.escalation.diagnosis}</p>}
            {issue.resumeTarget === null ? null : <p className="subtle">Reprise en « {ISSUE_STATE_LABELS[issue.resumeTarget]} » une fois le blocage levé.</p>}
          </div>
        </section>
      )}
      {waitingRun === undefined ? null : (
        <Link to={paths.run(waitingRun.id)} className="callout callout--waiting issue-question">
          <MessageCircleQuestionMark size={16} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">L’agent attend votre réponse</p>
            <p>{waitingRun.pendingQuestion?.text}</p>
            <span className="link">Répondre dans le run {waitingRun.id}</span>
          </div>
        </Link>
      )}

      <div className="issue-detail__grid">
        <Section title="Spécification">
          <div className="issue-spec">
            <div className="issue-spec__block">
              <p className="small-caps">Besoin</p>
              <p className="prose">{issue.spec.need}</p>
            </div>
            <div className="issue-spec__block">
              <p className="small-caps">Critères d’acceptation</p>
              <ol className="numbered">
                {issue.spec.acceptanceCriteria.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ol>
            </div>
            <div className="issue-spec__block">
              <p className="small-caps">Hors périmètre</p>
              {issue.spec.outOfScope.length === 0 ? (
                <p className="subtle">—</p>
              ) : (
                <ul className="bullets">
                  {issue.spec.outOfScope.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="issue-spec__block">
              <p className="small-caps">Preuve attendue</p>
              <p className="prose">{issue.spec.expectedProof}</p>
            </div>
          </div>
        </Section>
        <Section title="Dépendances">
          <div className="issue-deps">
            <DependencyList title="Dépend de" issues={upstream} />
            <DependencyList title="Bloque" issues={downstream} />
          </div>
        </Section>
      </div>

      <Section
        title="Checks d’acceptation"
        description={`${BEFORE_PROOF_KIND_LABELS[issue.beforeProofKind]}${issue.checksFrozenAt === null ? ' · pas encore gelés' : ` · gelés le ${dateTime(issue.checksFrozenAt)}`}`}
      >
        {issue.checks.length === 0 ? (
          <EmptyState compact icon={<FileLock2 size={16} />} title="Aucun check pour l’instant" description="L’auteur des checks les écrit à partir des critères, avant toute implémentation." />
        ) : (
          <ul className="issue-checks">
            {issue.checks.map((check) => (
              <li key={check.path} className="issue-check">
                <div className="issue-check__main">
                  <span className="issue-check__path mono">{check.path}</span>
                  <span className="issue-check__kind">{CHECK_KIND_LABELS[check.kind]}</span>
                </div>
                <div className="issue-check__proof">
                  <Badge tone={beforeTone(check)}>{BEFORE_RESULT_LABELS[check.before.result]}</Badge>
                  {check.before.score === null ? null : <span className="num">score {check.before.score.toLocaleString('fr-FR')}</span>}
                  {check.sha256 === null ? (
                    <span className="issue-check__hash subtle">non gelé</span>
                  ) : (
                    <span className="issue-check__hash mono" title={check.sha256}>
                      <Lock size={11} aria-hidden="true" /> {shortSha(check.sha256)}
                    </span>
                  )}
                </div>
                {check.before.detail.length === 0 ? null : <p className="issue-check__detail mono">{check.before.detail}</p>}
                {check.before.screenshotUrl === null ? null : (
                  <img className="issue-check__screenshot" src={check.before.screenshotUrl} alt={`Capture de la base pour ${check.path}`} loading="lazy" />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Tentatives" description="Deux corrections dans la session, puis une session neuve plus forte, puis intervention humaine.">
        {issue.attempts.length === 0 ? (
          <EmptyState compact title="Aucune tentative" description="L’implémentation démarre après le gel des checks." />
        ) : (
          <ol className="attempts">
            {issue.attempts.map((attempt) => (
              <li key={`${attempt.index}-${attempt.runId}`} className="attempt">
                <span className={`attempt__dot attempt__dot--${ATTEMPT_TONES[attempt.outcome]}`} aria-hidden="true" />
                <div className="attempt__body">
                  <p className="attempt__title">
                    <span>
                      {attempt.index}. {ATTEMPT_KIND_LABELS[attempt.kind]}
                    </span>
                    <Badge tone={ATTEMPT_TONES[attempt.outcome]}>{ATTEMPT_OUTCOME_LABELS[attempt.outcome]}</Badge>
                  </p>
                  <p className="attempt__summary">{attempt.summary}</p>
                  <p className="attempt__meta">
                    <span className="mono">{attempt.model}</span> · effort {EFFORT_LABELS[attempt.effort].toLocaleLowerCase('fr-FR')} ·{' '}
                    {attempt.endedAt === null ? `en cours depuis ${relativeTime(attempt.startedAt, now)}` : duration(toEpoch(attempt.endedAt) - toEpoch(attempt.startedAt))} ·{' '}
                    <Link to={paths.run(attempt.runId)} className="link">
                      {attempt.runId}
                    </Link>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </article>
  );
}
