import type { IssueState } from '@agent-factory/domain';
import { FEEDBACK_STATES } from '@agent-factory/domain';
import type { ChangedFile, CheckRunView, IssueView, PullRequestDiff, PullRequestState, PullRequestView, Reading, ReviewFindingView, ReviewRound } from '../../contract/index.ts';
import { PULL_REQUEST_STATES } from '../../contract/index.ts';
import type { PullRequestDiffState } from '../../data/pull-request-diffs.ts';
import { toEpoch } from '../../i18n/formatters.ts';
import { blamedConclusion, failsOnBaseToo } from '../../model/checks.ts';
import type { StatusMark } from '../../model/status.ts';
import { checksSummaryMark, conclusionMark } from '../../model/status.ts';

export type PullRequestGroups = Readonly<Record<PullRequestState, readonly PullRequestView[]>>;

export type MergeAvailability =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'blocked'; readonly blockers: readonly string[] };

/** A pull request is merged from the cockpit only while it is open, mergeable and nothing is named as blocking it. */
export function mergeAvailability(pullRequest: Pick<PullRequestView, 'state' | 'mergeable' | 'mergeBlockers'>): MergeAvailability {
  if (pullRequest.state !== 'open') return { kind: 'unavailable' };
  if (pullRequest.mergeable && pullRequest.mergeBlockers.length === 0) return { kind: 'ready' };
  return { kind: 'blocked', blockers: pullRequest.mergeBlockers };
}

/** The last thing that happened to a pull request, for ordering and for the list. */
export function pullRequestActivityAt(pullRequest: Pick<PullRequestView, 'mergedAt' | 'openedAt'>): string {
  return pullRequest.mergedAt ?? pullRequest.openedAt;
}

function byRecency(left: PullRequestView, right: PullRequestView): number {
  return toEpoch(pullRequestActivityAt(right)) - toEpoch(pullRequestActivityAt(left));
}

function readyFirst(left: PullRequestView, right: PullRequestView): number {
  return Number(mergeAvailability(right).kind === 'ready') - Number(mergeAvailability(left).kind === 'ready') || byRecency(left, right);
}

/** Open pull requests first, those that can be merged on top; then the merged ones and the closed ones, the most recent first. */
export function groupPullRequests(pullRequests: readonly PullRequestView[]): PullRequestGroups {
  const inState = (state: PullRequestState) => pullRequests.filter((pullRequest) => pullRequest.state === state);
  return {
    open: inState('open').toSorted(readyFirst),
    merged: inState('merged').toSorted(byRecency),
    closed: inState('closed').toSorted(byRecency),
  };
}

export function orderedPullRequests(groups: PullRequestGroups): readonly PullRequestView[] {
  return PULL_REQUEST_STATES.flatMap((state) => groups[state]);
}

/** The mark of one check run: a failure the base branch shares is neutral, since the change did not cause it. */
export function checkMark(check: Pick<CheckRunView, 'conclusion' | 'failsOnBase'>): StatusMark {
  return conclusionMark(blamedConclusion(check));
}

export type ChecksDigest =
  | { readonly kind: 'unread' }
  | { readonly kind: 'none' }
  | { readonly kind: 'counted'; readonly mark: StatusMark; readonly passed: number; readonly total: number; readonly failingOnBase: number };

/**
 * What the last known check runs of a pull request add up to; whatever the age of the reading, a kept
 * value counts. A failure the base branch shares is not held against the change, so it does not colour the mark.
 */
export function digestChecks(reading: Reading<readonly CheckRunView[]>): ChecksDigest {
  const checks = reading.value;
  if (checks === null) return { kind: 'unread' };
  if (checks.length === 0) return { kind: 'none' };
  return {
    kind: 'counted',
    mark: checksSummaryMark(checks.map(blamedConclusion)),
    passed: checks.filter((check) => check.conclusion === 'success').length,
    total: checks.length,
    failingOnBase: checks.filter(failsOnBaseToo).length,
  };
}

/** Whether any check run carries a duration: the forge does not always report one. */
export function hasDurations(checks: readonly CheckRunView[]): boolean {
  return checks.some((check) => check.durationMs !== null);
}

export type FeedbackAvailability =
  | { readonly kind: 'open' }
  | { readonly kind: 'pull-request-settled'; readonly state: PullRequestState }
  | { readonly kind: 'issue-not-awaiting-review'; readonly issueNumber: number; readonly issueState: IssueState };

export function feedbackAvailability(pullRequest: Pick<PullRequestView, 'state' | 'issueNumber'>, issues: readonly Pick<IssueView, 'number' | 'state'>[]): FeedbackAvailability {
  if (pullRequest.state !== 'open') return { kind: 'pull-request-settled', state: pullRequest.state };
  const issue = issues.find((entry) => entry.number === pullRequest.issueNumber);
  if (issue === undefined || FEEDBACK_STATES.includes(issue.state)) return { kind: 'open' };
  return { kind: 'issue-not-awaiting-review', issueNumber: issue.number, issueState: issue.state };
}

/** Review rounds, the latest first: the operator reads the current state of the review before its history. */
export function latestRoundFirst(rounds: readonly ReviewRound[]): readonly ReviewRound[] {
  return rounds.toSorted((left, right) => right.round - left.round);
}

export function unresolvedCount(round: Pick<ReviewRound, 'findings'>): number {
  return round.findings.filter((finding) => !finding.resolved).length;
}

export function findingLocation(finding: Pick<ReviewFindingView, 'file' | 'line'>): string | null {
  if (finding.file === null) return null;
  return finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
}

export interface FileTotals {
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
}

export function fileTotals(files: readonly ChangedFile[]): FileTotals {
  return {
    files: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
}

export function toggledPath(open: ReadonlySet<string>, path: string): ReadonlySet<string> {
  const next = new Set(open);
  if (!next.delete(path)) next.add(path);
  return next;
}

/** The diff a state holds, or the one an earlier read left in place; null while none was read. */
export function keptDiff(state: PullRequestDiffState): PullRequestDiff | null {
  if (state.status === 'ready') return state.diff;
  return state.status === 'idle' ? null : state.previous;
}

export type FilePatch =
  | { readonly kind: 'patch'; readonly patch: string; readonly truncated: boolean; readonly hunks: boolean }
  | { readonly kind: 'missing' };

const HUNK_HEADER_PREFIX = '@@';

/** Whether a patch has lines to colour; a binary file comes as a sentence with none. */
export function hasHunks(patch: string): boolean {
  return patch.split('\n').some((line) => line.startsWith(HUNK_HEADER_PREFIX));
}

/** What a diff holds for one file: its patch, or nothing when the diff lists no such file or gives it an empty patch. */
export function patchOf(diff: Pick<PullRequestDiff, 'files'>, path: string): FilePatch {
  const file = diff.files.find((entry) => entry.path === path);
  return file === undefined || file.patch.trim().length === 0 ? { kind: 'missing' } : { kind: 'patch', patch: file.patch, truncated: file.truncated, hunks: hasHunks(file.patch) };
}

const DELETED_FILE_HUNK = /^@@ -\d+(?:,\d+)? \+0,0 @@/m;

/**
 * Whether the head commit holds the file. A change that adds a line or removes none leaves it in
 * place. One that only removes lines either deletes the file or trims it, and only its patch tells
 * which: the hunk of a deleted file has no line on the side of the head commit.
 */
export function offersFileAtCommit(file: Pick<ChangedFile, 'additions' | 'deletions'>, found: FilePatch | null): boolean {
  if (file.additions > 0 || file.deletions === 0) return true;
  return found !== null && found.kind === 'patch' && found.hunks && !DELETED_FILE_HUNK.test(found.patch);
}
