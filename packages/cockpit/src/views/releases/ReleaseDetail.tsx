import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CircleCheck, CircleX, ExternalLink, GitBranch, Info, RefreshCw, Rocket, Scissors } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { ReleaseCommit, ReleaseView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { canCutRelease, canEvaluateRelease } from '../../model/actions.ts';
import { shortSha } from '../../model/identifiers.ts';
import { paths } from '../../model/routes.ts';
import { auditMark, releaseMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { CodeBlock } from '../../ui/components/CodeBlock.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { DetailHeader, MetaItem } from '../../ui/layout/Page.tsx';
import { CommandButton } from '../../widgets/CommandButton.tsx';
import { Time } from '../../widgets/Time.tsx';
import type { GateCondition } from './release-model.ts';
import { describeGateReason, gateConditions } from './release-model.ts';

const GATE_SHOWN_STATES: readonly ReleaseView['state'][] = ['cut', 'auditing', 'blocked', 'promotable', 'promoted', 'verified'];
const PRODUCTION_LINK_STATES: readonly ReleaseView['state'][] = ['promotable', 'blocked', 'auditing', 'promoted', 'verified'];

function ReleaseRef({ release }: { readonly release: ReleaseView }) {
  const { t } = useI18n();
  if (release.source === 'tag') return <>{t('releases.ref.tag', { ref: release.ref })}</>;
  return <>{release.pullRequestNumber === null ? t('releases.ref.pullRequestUnnumbered') : t('releases.ref.pull-request', { number: release.pullRequestNumber })}</>;
}

function TimelineRow({ label, hint, children }: { readonly label: string; readonly hint?: string | undefined; readonly children: ReactNode }) {
  return (
    <div className="release-timeline__row">
      <dt>
        {label}
        {hint === undefined ? null : <span className="release-timeline__hint">{hint}</span>}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function Instant({ iso }: { readonly iso: string }) {
  return (
    <>
      <Time iso={iso} mode="dateTime" /> <span className="subtle">(<Time iso={iso} />)</span>
    </>
  );
}

function Timeline({ release }: { readonly release: ReleaseView }) {
  const { t } = useI18n();
  const notYet = <span className="subtle">{t('releases.time.notYet')}</span>;
  return (
    <Section title={t('releases.timeline')} id="release-timeline">
      <dl className="release-timeline">
        <TimelineRow label={t('releases.time.created')} hint={t('releases.time.createdHint')}>
          {release.createdAt === null ? <span className="subtle">{t('releases.time.createdUnknown')}</span> : <Instant iso={release.createdAt} />}
        </TimelineRow>
        <TimelineRow label={t('releases.time.detected')} hint={t('releases.time.detectedHint')}>
          <Instant iso={release.detectedAt} />
        </TimelineRow>
        <TimelineRow label={t('releases.time.cut')}>{release.cutAt === null ? notYet : <Instant iso={release.cutAt} />}</TimelineRow>
        <TimelineRow label={t('releases.time.promoted')}>{release.promotedAt === null ? notYet : <Instant iso={release.promotedAt} />}</TimelineRow>
        <TimelineRow label={t('releases.time.verified')}>{release.verifiedAt === null ? notYet : <Instant iso={release.verifiedAt} />}</TimelineRow>
      </dl>
    </Section>
  );
}

function ConditionDetail({ condition }: { readonly condition: GateCondition }) {
  const { t } = useI18n();
  switch (condition.id) {
    case 'audits':
      if (condition.total === 0) return <>{t('releases.gate.auditsNone')}</>;
      return condition.failing === 0
        ? <>{t('releases.gate.auditsClosed', { count: condition.total })}</>
        : <>{t('releases.gate.auditsOpen', { count: condition.failing, ids: condition.failingIds.join(', ') })}</>;
    case 'evidence':
      if (condition.total === 0) return <>{t('releases.gate.evidenceNone')}</>;
      return condition.failing === 0
        ? <>{t('releases.gate.evidenceComplete', { count: condition.total })}</>
        : <>{t('releases.gate.evidenceIncomplete', { count: condition.failing })}</>;
    case 'health':
      if (condition.total === 0) return <>{t('releases.gate.healthNone')}</>;
      return condition.failing === 0
        ? <>{t('releases.gate.healthPassed', { count: condition.total })}</>
        : <>{t('releases.gate.healthFailed', { count: condition.failing })}</>;
  }
}

function Gate({ release }: { readonly release: ReleaseView }) {
  const { t, rich } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const promotable = release.gate.promotable;
  const conditions = gateConditions(release, project.audits);
  const conditionLabels = { audits: t('releases.gate.audits'), evidence: t('releases.gate.evidence'), health: t('releases.gate.health') } as const;
  return (
    <section className={`release-gate${promotable ? ' is-promotable' : ' is-blocked'}`} aria-label={t('releases.gate.title')}>
      <div className="release-gate__status">
        {promotable ? <CircleCheck size={22} aria-hidden="true" /> : <CircleX size={22} aria-hidden="true" />}
        <div>
          <p className="release-gate__title">{promotable ? t('releases.gate.promotable') : t('releases.gate.notPromotable')}</p>
          <p className="release-gate__meta">
            {release.gate.evaluatedAt === null ? t('releases.gate.notEvaluated') : rich('releases.gate.evaluated', { when: <Time iso={release.gate.evaluatedAt} /> })}
          </p>
        </div>
      </div>
      {release.gate.blockingReasons.length === 0 ? null : (
        <ul className="release-gate__reasons" aria-label={t('releases.gate.reasons')}>
          {release.gate.blockingReasons.map((reason) => (
            <li key={reason}>{describeGateReason(reason, t, vocabulary)}</li>
          ))}
        </ul>
      )}
      <ul className="release-gate__conditions" aria-label={t('releases.gate.conditions')}>
        {conditions.map((condition) => (
          <li key={condition.id} className="release-gate__condition">
            <StatusMark mark={condition.mark} size={14} />
            <span className="release-gate__condition-label">{conditionLabels[condition.id]}</span>
            <span className="release-gate__condition-detail">
              <ConditionDetail condition={condition} />
            </span>
          </li>
        ))}
      </ul>
      {PRODUCTION_LINK_STATES.includes(release.state) ? (
        <div className="release-gate__production">
          {release.productionWorkflowUrl === null ? (
            <p className="release-gate__note">{t('releases.production.missing')}</p>
          ) : (
            <>
              <a className={`ds-button ds-button--md ${promotable ? 'ds-button--secondary' : 'ds-button--ghost'}`} href={release.productionWorkflowUrl} target="_blank" rel="noreferrer">
                <Rocket size={14} aria-hidden="true" />
                <span className="ds-button__label">{t('releases.production.open')}</span>
                <ExternalLink size={13} aria-hidden="true" />
              </a>
              <p className="release-gate__note">{t('releases.production.note')}</p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function CommitTags({ commit }: { readonly commit: ReleaseCommit }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const audit = commit.auditId === null ? undefined : project.audits.find((entry) => entry.id === commit.auditId);
  return (
    <span className="release-commit__tags">
      {commit.attribution === 'factory-merge' ? <Badge tone="accent">{t('releases.commit.factoryMerge')}</Badge> : null}
      {commit.attribution === 'automation' ? (
        <Badge tone="idle">{commit.automation === null ? t('releases.commit.notAuditedUnnamed') : t('releases.commit.notAudited', { automation: commit.automation })}</Badge>
      ) : null}
      {commit.attribution === 'audit' ? <Badge>{t('releases.commit.audited')}</Badge> : null}
      {commit.evidenceComplete === null ? null : (
        <Badge tone={commit.evidenceComplete ? 'success' : 'failed'}>{commit.evidenceComplete ? t('releases.commit.evidenceComplete') : t('releases.commit.evidenceIncomplete')}</Badge>
      )}
      {audit === undefined ? null : (
        <Link to={paths.audit(project.id, audit.id)} className="release-commit__link">
          <StatusMark mark={auditMark(audit)} size={13} />
          {t('releases.commit.audit', { audit: shortSha(audit.commitSha), state: vocabulary.auditState(audit.state) })}
          {audit.resolved ? ` (${t('releases.commit.auditResolved')})` : ''}
        </Link>
      )}
      {commit.pullRequestNumber === null ? null : (
        <Link to={paths.pullRequest(project.id, commit.pullRequestNumber)} className="release-commit__link num">
          {t('releases.commit.pullRequest', { number: commit.pullRequestNumber })}
        </Link>
      )}
      {commit.issueNumber === null ? null : (
        <Link to={paths.issue(project.id, commit.issueNumber)} className="release-commit__link num">
          {t('releases.commit.issue', { number: commit.issueNumber })}
        </Link>
      )}
    </span>
  );
}

export function ReleaseDetail({ release }: { readonly release: ReleaseView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const superseded = release.supersededBy !== null;
  const cuttable = canCutRelease(release);
  const evaluable = canEvaluateRelease(release);
  return (
    <article className="detail release-detail">
      <DetailHeader
        back={{ to: paths.releases(project.id), label: t('releases.back') }}
        eyebrow={
          <>
            <StatusMark mark={releaseMark(release.state, release.supersededBy)} />
            {release.supersededBy === null ? <span>{vocabulary.releaseState(release.state)}</span> : <Badge tone="idle">{t('releases.supersededBy', { version: release.supersededBy })}</Badge>}
            <Badge>{vocabulary.releaseSource(release.source)}</Badge>
          </>
        }
        title={release.title}
        actions={
          <>
            {cuttable ? (
              <CommandButton
                command="release.cut"
                body={{ project: project.id, releaseId: release.id }}
                variant="primary"
                icon={<Scissors size={14} />}
                disabled={release.commits.length === 0}
                title={release.commits.length === 0 ? t('releases.cutNeedsCommits') : undefined}
              >
                {t('releases.cut')}
              </CommandButton>
            ) : null}
            {evaluable ? (
              <CommandButton command="release.evaluate" body={{ project: project.id, releaseId: release.id }} icon={<RefreshCw size={14} />}>
                {t('releases.evaluate')}
              </CommandButton>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaItem icon={<GitBranch size={13} />}>
              <span className="mono">
                <ReleaseRef release={release} />
              </span>
            </MetaItem>
            <MetaItem>{release.id}</MetaItem>
          </>
        }
      />

      {release.supersededBy === null ? null : (
        <div className="callout" role="note">
          <Info size={16} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">{t('releases.supersededTitle', { version: release.supersededBy })}</p>
            <p>{t('releases.supersededBody')}</p>
          </div>
        </div>
      )}

      <Timeline release={release} />

      {superseded || !GATE_SHOWN_STATES.includes(release.state) ? null : <Gate release={release} />}

      <Section title={t('releases.commits.title')} id="release-commits" description={t('releases.commitCount', { count: release.commits.length })}>
        {release.commits.length === 0 ? (
          <EmptyState compact title={t('releases.commits.empty')} description={t('releases.commits.emptyDescription')} />
        ) : (
          <ul className="release-commits" aria-label={t('releases.commits.list')}>
            {release.commits.map((commit) => (
              <li key={commit.sha} className="release-commit">
                <span className="release-commit__sha mono">{shortSha(commit.sha)}</span>
                <span className="release-commit__message">
                  <span className="truncate">{commit.message}</span>
                  <span className="release-commit__author">{commit.author ?? <span className="subtle">{t('releases.commits.authorUnknown')}</span>}</span>
                </span>
                <CommitTags commit={commit} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('releases.health.title')} id="release-health">
        {release.health.length === 0 ? (
          <EmptyState compact title={t('releases.health.empty')} />
        ) : (
          <ul className="release-health">
            {release.health.map((check) => (
              <li key={`${check.environment}-${check.name}`} className="release-health__item">
                <StatusMark mark={check.passed ? 'success' : 'failed'} size={14} />
                <span className="mono">
                  {check.environment} · {check.name}
                </span>
                <span className="release-health__detail">{check.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('releases.report.title')} id="release-report">
        {release.report.length === 0 ? <EmptyState compact title={t('releases.report.empty')} /> : <CodeBlock code={release.report} wrap title="report.md" />}
      </Section>
    </article>
  );
}
