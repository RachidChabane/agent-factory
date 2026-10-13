import { ACTIVE_PIPELINE_STATES, CHECK_REWRITABLE_STATES, ISSUE_ESCALATION_STATE, MERGED_OR_BEYOND_STATES } from '@agent-factory/domain';
import type { AuditView, InstallationInfo, IssueView, ReleaseView, RequestView } from '../contract/index.ts';

const REVIEWING_STATE = 'reviewing';

/** Whether every issue this one waits for has been merged; a dependency the project no longer holds does not block. */
export function dependenciesMerged(issue: Pick<IssueView, 'dependsOn'>, issues: readonly Pick<IssueView, 'number' | 'state'>[]): boolean {
  return issue.dependsOn.every((number) => {
    const dependency = issues.find((entry) => entry.number === number);
    return dependency === undefined || MERGED_OR_BEYOND_STATES.includes(dependency.state);
  });
}

export function canValidateSpec(issue: Pick<IssueView, 'state'>): boolean {
  return issue.state === 'spec-draft';
}

export function canStartIssue(issue: Pick<IssueView, 'state' | 'dependsOn'>, project: { readonly issues: readonly Pick<IssueView, 'number' | 'state'>[] }): boolean {
  return issue.state === 'spec-validated' && dependenciesMerged(issue, project.issues);
}

/** An escalated issue resumes where it stopped. */
export function canResumeEscalation(issue: Pick<IssueView, 'state' | 'resumeTarget'>): boolean {
  return issue.state === ISSUE_ESCALATION_STATE && issue.resumeTarget !== null;
}

/** An issue that escalated after its review can have the same implementation reviewed again; the factory refuses it when the gate had not passed. */
export function canReviewAgain(issue: Pick<IssueView, 'state' | 'resumeTarget'>): boolean {
  return issue.state === ISSUE_ESCALATION_STATE && issue.resumeTarget === REVIEWING_STATE;
}

export function canPauseIssue(issue: Pick<IssueView, 'state' | 'paused'>): boolean {
  return ACTIVE_PIPELINE_STATES.includes(issue.state) && !issue.paused;
}

export function canResumePausedIssue(issue: Pick<IssueView, 'paused'>): boolean {
  return issue.paused;
}

/** Only an escalated issue is abandoned; the lifecycle allows no other way out to the abandoned state. */
export function canAbandonIssue(issue: Pick<IssueView, 'state'>): boolean {
  return issue.state === ISSUE_ESCALATION_STATE;
}

export function frozenChecks(issue: Pick<IssueView, 'checks'>): IssueView['checks'] {
  return issue.checks.filter((check) => check.sha256 !== null);
}

export function canRewriteCheck(issue: Pick<IssueView, 'state' | 'checks'>): boolean {
  return frozenChecks(issue).length > 0 && (issue.state === ISSUE_ESCALATION_STATE || CHECK_REWRITABLE_STATES.includes(issue.state));
}

export function canChallengeRequest(request: Pick<RequestView, 'state'>): boolean {
  return request.state === 'received' || request.state === 'waiting-requester';
}

/** A release another version has already overtaken is history: it is never cut or promoted. */
export function canCutRelease(release: Pick<ReleaseView, 'state' | 'supersededBy'>): boolean {
  return release.supersededBy === null && release.state === 'open';
}

export function canEvaluateRelease(release: Pick<ReleaseView, 'state' | 'supersededBy'>): boolean {
  return release.supersededBy === null && ['cut', 'auditing', 'blocked', 'promotable'].includes(release.state);
}

export function canPublishAuditIssue(audit: Pick<AuditView, 'state' | 'resolved' | 'draft' | 'publishedIssueNumber'>): boolean {
  return (audit.state === 'challenge' || audit.state === 'rewrite') && !audit.resolved && audit.draft !== null && audit.publishedIssueNumber === null;
}

export function canResolveAudit(audit: Pick<AuditView, 'state' | 'resolved'>): boolean {
  return (audit.state === 'challenge' || audit.state === 'rewrite') && !audit.resolved;
}

export type DrainBlock = 'demonstration' | 'underway';

/** Why the factory cannot be asked to stop after its running work, or null when it can: the demonstration runs no factory process, and a drain already asked for is under way. */
export function drainBlock(installation: Pick<InstallationInfo, 'mode' | 'pauses'>): DrainBlock | null {
  if (installation.mode === 'demo') return 'demonstration';
  return isDraining(installation.pauses) ? 'underway' : null;
}

/** Whether the factory stops once its running work finishes. */
export function isDraining(pauses: readonly { readonly cause: string }[]): boolean {
  return pauses.some((pause) => pause.cause === 'drain');
}
