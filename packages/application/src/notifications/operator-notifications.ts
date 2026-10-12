import type { AuditVerdict, PauseCause } from '@agent-factory/domain';
import { SHORT_SHA_LENGTH } from '../audit/audit-issue-renderer.ts';
import type { WorktreesFullPayload } from '../daemon/daemon-events.ts';
import type { Notifier, OperationLog, PullRequestRef } from '../ports.ts';
import { COCKPIT_PATHS, cockpitLink } from './cockpit-links.ts';

export interface OperatorNotice {
  readonly title: string;
  readonly body: string;
  readonly path: string;
}

const PAUSE_TITLES: Readonly<Record<PauseCause, string>> = {
  resources: 'Factory paused: machine resources are short',
  budget: 'Factory paused: subscription budget spent',
  operator: 'Factory paused by the operator',
  drain: 'Factory draining: no new work starts, and it stops once the running work finishes',
};

const RESUME_TITLES: Readonly<Record<PauseCause, string>> = {
  resources: 'Factory resumed: machine resources recovered',
  budget: 'Factory resumed: subscription budget available',
  operator: 'Factory resumed by the operator',
  drain: 'Factory stopped after finishing its running work',
};

const LIST_SEPARATOR = ', ';

function holderText(holder: WorktreesFullPayload['holders'][number]): string {
  if (holder.pullRequestNumber !== null) return `issue #${holder.issueNumber} with pull request #${holder.pullRequestNumber}`;
  return holder.state === 'needs-human' ? `issue #${holder.issueNumber} waiting for a person` : `issue #${holder.issueNumber} in progress`;
}

export const NOTICES = {
  needsHuman: (issueNumber: number, reason: string): OperatorNotice => ({
    title: `Issue #${issueNumber} needs you`,
    body: reason,
    path: COCKPIT_PATHS.issue(issueNumber),
  }),
  pullRequestOpened: (issueNumber: number, pullRequest: PullRequestRef, evidenceComplete: boolean): OperatorNotice => ({
    title: `Pull request #${pullRequest.number} opened for issue #${issueNumber}`,
    body: evidenceComplete ? `The evidence is complete. ${pullRequest.url}` : `Some evidence is missing. ${pullRequest.url}`,
    path: COCKPIT_PATHS.pullRequest(pullRequest.number),
  }),
  pullRequestUpdated: (issueNumber: number, pullRequestNumber: number): OperatorNotice => ({
    title: `Pull request #${pullRequestNumber} updated after feedback`,
    body: `Issue #${issueNumber} went through another implementation cycle and its pull request body carries the new evidence.`,
    path: COCKPIT_PATHS.pullRequest(pullRequestNumber),
  }),
  auditConcluded: (auditId: string, verdict: AuditVerdict, summary: string): OperatorNotice => ({
    title: `Audit of ${auditId.slice(0, SHORT_SHA_LENGTH)} concluded: ${verdict}`,
    body: summary,
    path: COCKPIT_PATHS.audit(auditId),
  }),
  releaseGate: (releaseId: string, promotable: boolean, blockingReasons: readonly string[]): OperatorNotice => ({
    title: promotable ? `Release ${releaseId} is promotable` : `Release ${releaseId} is blocked`,
    body: promotable ? 'Every gate condition holds; the production workflow can run.' : blockingReasons.map((reason) => `- ${reason}`).join('\n'),
    path: COCKPIT_PATHS.release(releaseId),
  }),
  paused: (cause: PauseCause, reason: string, resumesAt: Date | null): OperatorNotice => ({
    title: PAUSE_TITLES[cause],
    body: resumesAt === null ? reason : `${reason}. Scheduling resumes after ${resumesAt.toISOString()}.`,
    path: COCKPIT_PATHS.board,
  }),
  resumed: (cause: PauseCause): OperatorNotice => ({
    title: RESUME_TITLES[cause],
    body: 'Scheduling continues.',
    path: COCKPIT_PATHS.board,
  }),
  worktreesFull: (shortage: WorktreesFullPayload): OperatorNotice => {
    const waiting = shortage.waiting.map((number) => `#${number}`).join(LIST_SEPARATOR);
    const ready = shortage.waiting.length === 1 ? `Issue ${waiting} is ready` : `Issues ${waiting} are ready`;
    const pool = shortage.poolSize === 1 ? 'its only worktree is' : `all ${shortage.poolSize} worktrees are`;
    return {
      title: 'No worktree is free: issues wait',
      body: `${ready} to start, but ${pool} held by ${shortage.holders.map(holderText).join(LIST_SEPARATOR)}. Merge or abandon one to make room.`,
      path: COCKPIT_PATHS.board,
    };
  },
  requestChallenged: (requestId: string, specCount: number): OperatorNotice => ({
    title: `Request ${requestId} challenged`,
    body: `The report, the draft reply and ${specCount} proposed spec(s) wait for your review.`,
    path: COCKPIT_PATHS.request(requestId),
  }),
  failed: (what: string, reason: string): OperatorNotice => ({
    title: `Factory error: ${what}`,
    body: reason,
    path: COCKPIT_PATHS.board,
  }),
} as const;

export class OperatorNotifications {
  private readonly notifier: Notifier;
  private readonly cockpitUrl: string;
  private readonly log: OperationLog;

  constructor(notifier: Notifier, cockpitUrl: string, log: OperationLog) {
    this.notifier = notifier;
    this.cockpitUrl = cockpitUrl;
    this.log = log;
  }

  async send(notice: OperatorNotice): Promise<void> {
    this.log.info(`${notice.title}: ${notice.body}`);
    try {
      await this.notifier.notify(notice.title, notice.body, cockpitLink(this.cockpitUrl, notice.path));
    } catch (error) {
      this.log.warn(`notification "${notice.title}" was not delivered: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
