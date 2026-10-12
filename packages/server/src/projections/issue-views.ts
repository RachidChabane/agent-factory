import type { AcceptanceCheck, Attempt, IssueView } from '@agent-factory/cockpit';
import {
  proofExpectation,
  reportedFileMatches,
  ISSUE_ESCALATION_STATE,
  ISSUE_SUBJECT_PREFIX,
  ISSUE_TRANSITIONED_EVENT,
  issueSubject,
} from '@agent-factory/domain';
import type { BaseExpectation, BeforeProofKind, IssueSpec, TestRunner } from '@agent-factory/domain';
import {
  checkPaths,
  ISSUE_PAUSED_EVENT,
  ISSUE_UNPAUSED_EVENT,
  AgentRunStartedSchema,
  ImplementerAttemptFinishedSchema,
  PIPELINE_EVENTS,
  projectJournal,
  reviewRecord,
  gateRecord,
  decisionAfter,
  type FactoryEventRecord,
  type ImplementerAttemptRecord,
  type PipelineJournal,
} from '@agent-factory/application';
import { firstOf, iso, type EventIndex } from './event-index.ts';
import type { SnapshotContext } from './snapshot-context.ts';

type CheckKind = AcceptanceCheck['kind'];
type AttemptKind = Attempt['kind'];
type AttemptOutcome = Attempt['outcome'];

export const CHECK_KIND_BY_RUNNER: Readonly<Record<TestRunner, CheckKind>> = {
  playwright: 'playwright',
  eval: 'evaluation',
  pytest: 'unit',
  vitest: 'unit',
  'node-test': 'unit',
};
const UNKNOWN_RUNNER_KIND: CheckKind = 'unit';
const NO_BEFORE_PROOF: BeforeProofKind = 'none';

function expectedProofKind(spec: IssueSpec, context: SnapshotContext): BeforeProofKind {
  const { typology } = context.conventions;
  return typology.has(spec.type) ? proofExpectation(typology.get(spec.type).proof).kind : NO_BEFORE_PROOF;
}

const ATTEMPT_KIND_BY_MODE: Readonly<Record<ImplementerAttemptRecord['mode'], AttemptKind>> = {
  initial: 'session',
  resumed: 'correction',
  'fresh-escalated': 'fresh-session',
};

const IMPLEMENTER_ROLE = 'implementer';
const SUCCESS = 'success';
const IMAGE_EXTENSIONS: readonly string[] = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const ISSUE_NUMBER_PATTERN = new RegExp(`^${ISSUE_SUBJECT_PREFIX}(\\d+)$`);
const BEFORE_STATE_FOR_PENDING = 'spec-validated';
const EPOCH = new Date(0);

function isImage(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function issueNumberOf(subject: string): number | null {
  const number = Number(ISSUE_NUMBER_PATTERN.exec(subject)?.[1]);
  return Number.isInteger(number) ? number : null;
}

export function pausedIssueNumbers(index: EventIndex): ReadonlySet<number> {
  const paused = new Set<number>();
  for (const record of index.records) {
    if (record.type !== ISSUE_PAUSED_EVENT && record.type !== ISSUE_UNPAUSED_EVENT) continue;
    const number = issueNumberOf(record.subject);
    if (number === null) continue;
    if (record.type === ISSUE_PAUSED_EVENT) paused.add(number);
    else paused.delete(number);
  }
  return paused;
}

const NO_DETAIL = '';

function beforeResult(journal: PipelineJournal): AcceptanceCheck['before'] {
  const proof = journal.beforeProof;
  if (proof === null) return { result: 'not-run', detail: NO_DETAIL, score: null, screenshotUrl: null };
  const detail = proof.evaluation.valid ? NO_DETAIL : `invalid: ${proof.evaluation.reason}`;
  const result = !proof.checksExpressible ? 'not-run' : proof.baseScore !== null ? 'scored' : proof.checksFailedOnBase ? 'failed' : 'passed';
  return { result, detail, score: proof.baseScore, screenshotUrl: null };
}

function expectationOf(journal: PipelineJournal, path: string): BaseExpectation | null {
  return journal.manifest?.checks.find((check) => check.paths.includes(path))?.onBase ?? null;
}

function fileResult(journal: PipelineJournal, path: string, fallback: AcceptanceCheck['before']): AcceptanceCheck['before'] {
  const tests = (journal.beforeProof?.tests ?? []).filter((test) => reportedFileMatches(test.file, path));
  if (tests.some((test) => test.outcome === 'failed')) return { ...fallback, result: 'failed' };
  if (tests.some((test) => test.outcome === 'passed')) return { ...fallback, result: 'passed' };
  return fallback;
}

function checksOf(journal: PipelineJournal, spec: IssueSpec, context: SnapshotContext): AcceptanceCheck[] {
  const before = beforeResult(journal);
  const screenshot = journal.beforeProof?.evidence.find((entry) => entry.cachedPath !== null && isImage(entry.path));
  const withScreenshot = { ...before, screenshotUrl: screenshot === undefined ? null : context.links.evidence(spec.number, screenshot.cachedPath ?? screenshot.path) };
  const runner = journal.manifest?.runner ?? journal.beforeProof?.runner ?? null;
  const kind = runner === null ? UNKNOWN_RUNNER_KIND : CHECK_KIND_BY_RUNNER[runner];
  if (journal.frozen !== null) {
    return journal.frozen.checks.map((check) => ({
      path: check.path,
      kind,
      sha256: check.sha256,
      onBase: expectationOf(journal, check.path),
      before: fileResult(journal, check.path, withScreenshot),
    }));
  }
  if (journal.manifest !== null) {
    return checkPaths(journal.manifest).map((path) => ({ path, kind, sha256: null, onBase: expectationOf(journal, path), before: fileResult(journal, path, withScreenshot) }));
  }
  return [];
}

function attemptOutcome(journal: PipelineJournal, record: ImplementerAttemptRecord): AttemptOutcome {
  const gate = gateRecord(journal, record.attempt);
  if (gate !== null && !gate.result.passed) return 'gate-failed';
  if (gate === null && record.outcome !== SUCCESS) return record.gateBlocks > 0 ? 'gate-failed' : 'error';
  const review = reviewRecord(journal, record.attempt);
  if (review !== null && review.findings.some((finding) => finding.severity === 'blocking')) return 'review-failed';
  return gate === null ? 'running' : 'passed';
}

function attemptsOf(journal: PipelineJournal, records: readonly FactoryEventRecord[]): Attempt[] {
  const starts = records.flatMap((record) => {
    if (record.type !== PIPELINE_EVENTS.agentRunStarted) return [];
    const parsed = AgentRunStartedSchema.safeParse(record.payload);
    return parsed.success ? [{ ...parsed.data, at: iso(record.occurredAt) }] : [];
  });
  const finishedAt = new Map<number, string>();
  for (const record of records) {
    if (record.type !== PIPELINE_EVENTS.implementerAttemptFinished) continue;
    const parsed = ImplementerAttemptFinishedSchema.safeParse(record.payload);
    if (parsed.success) finishedAt.set(parsed.data.attempt, iso(record.occurredAt));
  }
  const latest = [...new Map(journal.attempts.map((record) => [record.attempt, record])).values()];
  const attempts: Attempt[] = latest.map((record) => ({
    index: record.attempt,
    kind: ATTEMPT_KIND_BY_MODE[record.mode],
    runId: record.runId,
    model: record.model,
    effort: record.effort,
    startedAt: starts.find((start) => start.runId === record.runId)?.at ?? finishedAt.get(record.attempt) ?? iso(EPOCH),
    endedAt: finishedAt.get(record.attempt) ?? null,
    outcome: attemptOutcome(journal, record),
    summary: decisionAfter(journal, record.attempt)?.failure.summary ?? '',
  }));
  const running = starts.at(-1);
  const finished = running !== undefined && journal.agentRuns.some((run) => run.runId === running.runId);
  if (running !== undefined && running.role === IMPLEMENTER_ROLE && !finished) {
    attempts.push({
      index: latest.length,
      kind: running.resumeSessionId === null ? (latest.length === 0 ? 'session' : 'fresh-session') : 'correction',
      runId: running.runId,
      model: running.model,
      effort: running.effort,
      startedAt: running.at,
      endedAt: null,
      outcome: 'running',
      summary: '',
    });
  }
  return attempts;
}

function escalationOf(journal: PipelineJournal, records: readonly FactoryEventRecord[]): IssueView['escalation'] {
  if (journal.state !== ISSUE_ESCALATION_STATE) return null;
  const since = records.findLast((record) => record.type === ISSUE_TRANSITIONED_EVENT);
  const reason = journal.escalationReason ?? '';
  return { reason, diagnosis: reason, since: iso(since?.occurredAt ?? new Date(0)) };
}

function issueView(
  number: number,
  spec: IssueSpec,
  journal: PipelineJournal | null,
  records: readonly FactoryEventRecord[],
  context: SnapshotContext,
  paused: ReadonlySet<number>,
  requestOfIssue: ReadonlyMap<number, string>,
): IssueView {
  const created = records[0]?.occurredAt ?? context.generatedAt;
  const updated = records.at(-1)?.occurredAt ?? context.generatedAt;
  const frozenAt = firstOf(records, PIPELINE_EVENTS.checksFrozen);
  const proof = journal?.beforeProof?.evaluation;
  return {
    number,
    title: spec.title,
    type: spec.type,
    state: journal?.state ?? BEFORE_STATE_FOR_PENDING,
    resumeTarget: journal !== null && journal.state === ISSUE_ESCALATION_STATE ? journal.stateBeforeEscalation : null,
    paused: paused.has(number),
    spec: { need: spec.need, acceptanceCriteria: [...spec.acceptanceCriteria], outOfScope: [...spec.outOfScope], expectedProof: spec.expectedProof },
    dependsOn: [...spec.dependsOn],
    requestId: requestOfIssue.get(number) ?? null,
    branch: journal?.branch ?? null,
    pullRequestNumber: journal?.pullRequest?.number ?? null,
    beforeProofKind: proof !== undefined && proof.valid ? proof.kind : expectedProofKind(spec, context),
    checks: journal === null ? [] : checksOf(journal, spec, context),
    checksFrozenAt: frozenAt === null ? null : iso(frozenAt.occurredAt),
    attempts: journal === null ? [] : attemptsOf(journal, records),
    escalation: journal === null ? null : escalationOf(journal, records),
    createdAt: iso(created),
    updatedAt: iso(updated),
    url: context.links.issue(number),
  };
}

export function issueJournals(index: EventIndex): ReadonlyMap<number, PipelineJournal> {
  const journals = new Map<number, PipelineJournal>();
  for (const subject of index.subjectsWithPrefix(ISSUE_SUBJECT_PREFIX)) {
    const number = issueNumberOf(subject);
    if (number !== null) journals.set(number, projectJournal(number, index.subject(subject)));
  }
  return journals;
}

export function projectIssues(
  index: EventIndex,
  journals: ReadonlyMap<number, PipelineJournal>,
  context: SnapshotContext,
  requestOfIssue: ReadonlyMap<number, string>,
): IssueView[] {
  const paused = pausedIssueNumbers(index);
  const views: IssueView[] = [];
  for (const [number, journal] of journals) {
    if (journal.spec === null) continue;
    views.push(issueView(number, journal.spec, journal, index.subject(issueSubject(number)), context, paused, requestOfIssue));
  }
  for (const spec of context.pendingIssues) {
    if ((journals.get(spec.number)?.spec ?? null) !== null) continue;
    views.push(issueView(spec.number, spec, null, [], context, paused, requestOfIssue));
  }
  return views.sort((left, right) => left.number - right.number);
}
