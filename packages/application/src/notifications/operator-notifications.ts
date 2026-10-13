import type { AuditVerdict, PauseCause } from '@agent-factory/domain';
import { SHORT_SHA_LENGTH } from '../audit/audit-issue-renderer.ts';
import type { WorktreesFullPayload } from '../daemon/daemon-events.ts';
import type { GestureMadePayload } from '../autonomy/autonomy-events.ts';
import { describeGestureMade } from '../autonomy/gesture-sentence.ts';
import type { NoticeLink, Notifier, OperationLog, PullRequestRef } from '../ports.ts';
import { COCKPIT_PATHS, cockpitLink } from './cockpit-links.ts';

export interface OperatorNotice {
  readonly title: string;
  readonly body: string;
  readonly path: string;
  /** Links to files the notice is about, each a label and an address the operator can open. */
  readonly media?: readonly NoticeLink[];
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
const WORD_SEPARATOR = ' ';
const NO_MEDIA: readonly NoticeLink[] = [];

function holderText(holder: WorktreesFullPayload['holders'][number]): string {
  if (holder.pullRequestNumber !== null) return `issue #${holder.issueNumber} with pull request #${holder.pullRequestNumber}`;
  return holder.state === 'needs-human' ? `issue #${holder.issueNumber} waiting for a person` : `issue #${holder.issueNumber} in progress`;
}

/** What the notice that a pull request is ready tells: the pull request, its recorded films and the links to its media. */
export interface ReadyNoticeFacts {
  readonly issueNumber: number;
  readonly pullRequest: PullRequestRef;
  readonly title: string;
  readonly films: readonly string[];
  readonly media: readonly NoticeLink[];
}

/** What the notice that the films of a project wait for a tool tells. */
export interface FilmToolsUnavailableFacts {
  readonly projectId: string;
  readonly tool: string;
  readonly status: 'unauthenticated' | 'missing' | 'error';
  readonly detail: string;
  readonly loginCommand: string | null;
  readonly fixCommand: string | null;
  readonly recheckEveryMinutes: number;
}

const TOOL_STATUS_PHRASES: Readonly<Record<FilmToolsUnavailableFacts['status'], string>> = {
  unauthenticated: 'is not logged in',
  missing: 'is not installed',
  error: 'did not answer its check',
};

function toolRecovery(facts: Pick<FilmToolsUnavailableFacts, 'loginCommand' | 'fixCommand'>): string {
  if (facts.loginCommand !== null) return `Log in with: ${facts.loginCommand}.`;
  if (facts.fixCommand !== null) return `The tool declares no login the factory can start. Restore it with: ${facts.fixCommand}.`;
  return 'The tool declares no login or fix command: restore it by hand.';
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
  gestureDelegated: (decision: GestureMadePayload): OperatorNotice => ({
    title: describeGestureMade(decision),
    body: `Reason: ${decision.reason}. Allowed by ${decision.rule}.`,
    path: decision.target.kind === 'pull-request' ? COCKPIT_PATHS.pullRequest(decision.target.number) : COCKPIT_PATHS.issue(decision.target.number),
  }),
  pullRequestReady: (ready: ReadyNoticeFacts): OperatorNotice => ({
    title: `Pull request #${ready.pullRequest.number} is ready to merge`,
    body: [
      `${ready.title} (issue #${ready.issueNumber}).`,
      'Its required checks passed.',
      ready.films.length === 0 ? 'No film was recorded.' : `Films recorded: ${ready.films.join(LIST_SEPARATOR)}.`,
      ready.pullRequest.url,
    ].join(WORD_SEPARATOR),
    path: COCKPIT_PATHS.pullRequest(ready.pullRequest.number),
    media: ready.media,
  }),
  filmFinished: (issueNumber: number, pullRequestNumber: number, scenario: string): OperatorNotice => ({
    title: `Films of scenario ${scenario} recorded for issue #${issueNumber}`,
    body: `Pull request #${pullRequestNumber} carries the before and after recordings.`,
    path: COCKPIT_PATHS.pullRequest(pullRequestNumber),
  }),
  filmFailed: (issueNumber: number, scenario: string, reason: string): OperatorNotice => ({
    title: `Films of scenario ${scenario} failed for issue #${issueNumber}`,
    body: reason,
    path: COCKPIT_PATHS.issue(issueNumber),
  }),
  filmToolsUnavailable: (facts: FilmToolsUnavailableFacts): OperatorNotice => ({
    title: `Films of ${facts.projectId} wait for ${facts.tool}`,
    body: [
      `The tool ${facts.tool} ${TOOL_STATUS_PHRASES[facts.status]}${facts.detail === '' ? '' : `: ${facts.detail}`}.`,
      'The queued films stay queued and none fails.',
      toolRecovery(facts),
      `The factory checks again every ${facts.recheckEveryMinutes} minutes and starts the films once every tool passes.`,
    ].join(WORD_SEPARATOR),
    path: COCKPIT_PATHS.settings,
  }),
  filmToolsAvailable: (facts: { readonly projectId: string; readonly tool: string }): OperatorNotice => ({
    title: `Films of ${facts.projectId} resume`,
    body: `The tool ${facts.tool} passes its check again: the queued films start.`,
    path: COCKPIT_PATHS.settings,
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

  /** Sends the notice to every channel; says whether every one took it. A failed delivery is logged, never thrown. */
  async send(notice: OperatorNotice): Promise<boolean> {
    this.log.info(`${notice.title}: ${notice.body}`);
    try {
      await this.notifier.notify(notice.title, notice.body, cockpitLink(this.cockpitUrl, notice.path), notice.media ?? NO_MEDIA);
      return true;
    } catch (error) {
      this.log.warn(`notification "${notice.title}" was not delivered: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
