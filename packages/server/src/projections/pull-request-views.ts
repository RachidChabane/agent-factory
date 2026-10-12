import type { ChangedFile, Evidence, ExternalFeedback, PullRequestView, ReviewRound } from '@agent-factory/cockpit';
import { acceptanceTestResults, issueSubject } from '@agent-factory/domain';
import {
  DEFAULT_MINIMUM_TARGETED_DELTA,
  DEFAULT_REGRESSION_TOLERANCE,
} from '@agent-factory/domain';
import {
  acceptanceCommand,
  commandSection,
  criterionChecksOf,
  stripAnsi,
  failingOnBase,
  MERGEABLE_STATES,
  PIPELINE_EVENTS,
  pullRequestTitle,
  WorktreeAcquiredSchema,
  type CheckRunSummary,
  type FactoryEventRecord,
  type PipelineJournal,
} from '@agent-factory/application';
import { firstOf, iso, lastOf, type EventIndex } from './event-index.ts';
import { withoutLocalPaths } from './local-paths.ts';
import { baseRunSummary, branchRunSummary } from './proof-summary.ts';
import { NEVER_READ, observedView, type Observed } from '../snapshot/cached-reading.ts';
import { logKey, type ProjectSnapshotContext } from './snapshot-context.ts';

const FAILING_CONCLUSIONS: readonly CheckRunSummary['conclusion'][] = ['failure', 'cancelled'];
const PENDING_CONCLUSION: CheckRunSummary['conclusion'] = 'pending';
const IMAGE_EXTENSIONS: readonly string[] = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const RED_GREEN_ID = 'red-green';
const EVAL_SCORES_ID = 'eval-scores';
const ACCEPTANCE_TESTS_ID = 'acceptance-tests';
const NO_COMMAND = 'gate';
const NO_PATCH = '';
const FIRST_CRITERION = 1;

function isImage(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function proofLogExcerpt(text: string, command: string | null, maxCharacters: number): string {
  const clean = stripAnsi(text);
  const excerpt = command === null ? clean : (commandSection(clean, command) ?? clean);
  return excerpt.slice(-maxCharacters);
}

function logText(context: ProjectSnapshotContext, issueNumber: number, name: string | null): string {
  return name === null ? '' : stripAnsi(context.logs.get(logKey(issueNumber, name)) ?? '');
}

function worktreePathsOf(journal: PipelineJournal, records: readonly FactoryEventRecord[]): readonly string[] {
  const acquired = WorktreeAcquiredSchema.safeParse(lastOf(records, PIPELINE_EVENTS.worktreeAcquired)?.payload).data?.path;
  return [journal.worktree?.path, acquired].filter((path): path is string => path !== undefined);
}

function changedFiles(journal: PipelineJournal): ChangedFile[] {
  return (journal.evidence?.changes ?? []).map((change) => ({ path: change.path, additions: change.added, deletions: change.removed, patch: NO_PATCH }));
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function baseShaOf(journal: PipelineJournal, records: readonly FactoryEventRecord[]): string {
  if (journal.worktree !== null) return journal.worktree.baseSha;
  const acquired = lastOf(records, PIPELINE_EVENTS.worktreeAcquired);
  return WorktreeAcquiredSchema.safeParse(acquired?.payload).data?.baseSha ?? '';
}

function evidenceOf(journal: PipelineJournal, context: ProjectSnapshotContext, records: readonly FactoryEventRecord[]): Evidence[] {
  const record = journal.evidence;
  if (record === null) return [];
  const issueNumber = journal.issueNumber;
  const url = (path: string): string => context.links.evidence(issueNumber, path);
  const files = record.bundle.files;
  const images: Evidence[] = [...new Set(files.map((file) => file.sourcePath))].flatMap((sourcePath) => {
    const before = files.find((file) => file.sourcePath === sourcePath && file.phase === 'before');
    const after = files.find((file) => file.sourcePath === sourcePath && file.phase === 'after');
    if (before === undefined || after === undefined || !isImage(sourcePath)) return [];
    return [{ kind: 'image-compare', id: sourcePath, title: sourcePath, caption: after.caption, beforeUrl: url(`${before.phase}/${sourcePath}`), afterUrl: url(`${after.phase}/${sourcePath}`), width: 0, height: 0 }];
  });
  const evidence: Evidence[] = [...images];
  const proof = journal.beforeProof;
  const lastGate = journal.gates.at(-1);
  const localPaths = worktreePathsOf(journal, records);
  const display = (text: string): string => withoutLocalPaths(text, localPaths);
  if (proof !== null && proof.checksExpressible && journal.manifest !== null && lastGate !== undefined) {
    const command = acceptanceCommand(journal.manifest);
    const gateLog = logText(context, issueNumber, lastGate.logName);
    const acceptanceLog = command === null ? null : commandSection(gateLog, command);
    evidence.push({
      kind: 'red-green',
      id: RED_GREEN_ID,
      title: 'Acceptance checks',
      command: display(command ?? NO_COMMAND),
      before: {
        outcome: proof.checksFailedOnBase ? 'failed' : 'passed',
        sha: baseShaOf(journal, records),
        log: display(logText(context, issueNumber, proof.logName)),
        summary: proof.tests.length === 0 ? null : baseRunSummary(proof.tests),
      },
      after: {
        outcome: lastGate.result.passed ? 'passed' : 'failed',
        sha: record.sha,
        log: display(acceptanceLog ?? gateLog),
        summary: proof.tests.length === 0 ? null : branchRunSummary(proof.tests, lastGate.tests),
      },
    });
  }
  if (proof !== null && proof.tests.length > 0) {
    evidence.push({
      kind: 'acceptance-tests',
      id: ACCEPTANCE_TESTS_ID,
      title: 'Acceptance tests',
      runner: proof.runner,
      criteria: (journal.spec?.acceptanceCriteria ?? []).map((text, position) => ({ criterion: position + FIRST_CRITERION, text })),
      rows: [...acceptanceTestResults(proof.tests, lastGate?.tests ?? [], criterionChecksOf(journal.manifest))],
    });
  }
  const baseReport = proof?.scoreReport ?? null;
  const branchReport = lastGate?.scoreReport ?? null;
  if (baseReport !== null && branchReport !== null) {
    evidence.push({
      kind: 'eval-scores',
      id: EVAL_SCORES_ID,
      title: 'Evaluation scores',
      runsPerCase: branchReport.cases[0]?.scores.length ?? 0,
      minimumDelta: DEFAULT_MINIMUM_TARGETED_DELTA,
      regressionTolerance: DEFAULT_REGRESSION_TOLERANCE,
      cases: branchReport.cases.map((entry) => ({
        caseId: entry.id,
        label: entry.id,
        targeted: entry.targeted,
        baseScore: mean(baseReport.cases.find((candidate) => candidate.id === entry.id)?.scores ?? []),
        branchScore: mean(entry.scores),
      })),
    });
  }
  return evidence;
}

function reviewRounds(journal: PipelineJournal, index: EventIndex): ReviewRound[] {
  const records = index.subject(issueSubject(journal.issueNumber)).filter((record) => record.type === PIPELINE_EVENTS.reviewCompleted);
  const lastRound = journal.reviews.at(-1)?.attempt ?? 0;
  return journal.reviews.map((review, position) => ({
    round: review.attempt,
    runId: review.runId,
    completedAt: iso(records[position]?.occurredAt ?? new Date(0)),
    findings: review.findings.map((finding) => ({ ...finding, resolved: review.attempt < lastRound })),
  }));
}

function feedbackOf(journal: PipelineJournal): ExternalFeedback[] {
  return journal.feedback.map((feedback) => ({
    id: feedback.id,
    author: feedback.author,
    source: feedback.source,
    receivedAt: feedback.receivedAt,
    body: feedback.body,
    cycleStarted: feedback.cycleStarted,
  }));
}

function mergeBlockers(journal: PipelineJournal, checks: Observed<readonly CheckRunSummary[]>, preExisting: ReadonlySet<string>, evidenceComplete: boolean): string[] {
  const blockers: string[] = [];
  if (journal.state === null || !MERGEABLE_STATES.includes(journal.state)) blockers.push(`the issue is ${journal.state ?? 'unknown'}`);
  if (!evidenceComplete) blockers.push('evidence is missing');
  if (checks.value === null) blockers.push('the checks of the head commit were not read yet');
  for (const check of checks.value ?? []) {
    if (FAILING_CONCLUSIONS.includes(check.conclusion) && !preExisting.has(check.name)) blockers.push(`check ${check.name} failed`);
    if (check.conclusion === PENDING_CONCLUSION) blockers.push(`check ${check.name} is still running`);
  }
  return blockers;
}

export function projectPullRequests(
  journals: ReadonlyMap<number, PipelineJournal>,
  index: EventIndex,
  context: ProjectSnapshotContext,
): PullRequestView[] {
  const views: PullRequestView[] = [];
  for (const journal of journals.values()) {
    const pullRequest = journal.pullRequest;
    const spec = journal.spec;
    if (pullRequest === null || spec === null || journal.branch === null) continue;
    const records = index.subject(issueSubject(journal.issueNumber));
    const opened = firstOf(records, PIPELINE_EVENTS.pullRequestOpened);
    const merged = firstOf(records, PIPELINE_EVENTS.pullRequestMerged);
    const checks = context.pullRequestChecks.get(pullRequest.number) ?? NEVER_READ;
    const preExisting = failingOnBase(checks.value ?? [], context.baseChecks.value ?? []);
    const missing = journal.evidence?.bundle.missing.map((entry) => `${entry.sourcePath} (${entry.phase})`) ?? [];
    const evidenceComplete = journal.evidence !== null && missing.length === 0;
    const blockers = journal.mergeSha === null ? mergeBlockers(journal, checks, preExisting, evidenceComplete) : ['already merged'];
    views.push({
      number: pullRequest.number,
      title: context.pullRequestTitles.get(pullRequest.number) ?? pullRequestTitle(spec, context.conventions, journal.evidence?.changes.map((change) => change.path)),
      issueNumber: journal.issueNumber,
      type: spec.type,
      branch: journal.branch,
      url: context.links.forge(pullRequest.url),
      headSha: journal.evidenceRemoval?.headSha ?? journal.pushedHead ?? pullRequest.headSha,
      state: journal.mergeSha === null ? 'open' : 'merged',
      openedAt: iso(opened?.occurredAt ?? context.generatedAt),
      mergedAt: merged === null ? null : iso(merged.occurredAt),
      checks: observedView(checks, (runs) => runs.map((check) => ({ name: check.name, conclusion: check.conclusion, url: context.links.forge(check.url), durationMs: null, failsOnBase: preExisting.has(check.name) }))),
      evidenceComplete,
      missingEvidence: missing,
      evidence: evidenceOf(journal, context, records),
      reviewRounds: reviewRounds(journal, index),
      externalFeedback: feedbackOf(journal),
      files: changedFiles(journal),
      mergeable: blockers.length === 0,
      mergeBlockers: blockers,
    });
  }
  return views.sort((left, right) => left.number - right.number);
}
