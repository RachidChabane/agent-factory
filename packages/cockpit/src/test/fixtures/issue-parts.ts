import type { BaseExpectation, TestRunner } from '@agent-factory/domain';
import type { AcceptanceCheck, Attempt, AttemptKind, AttemptOutcome, BeforeResult, IssueSpecView, ProposedSpec, RunView } from '../../contract/index.ts';
import { contentHash } from './time.ts';
import { runOf, type RunWorld } from './runs.ts';

const COST_PRECISION = 10_000;

export interface BeforeSeed {
  readonly result: BeforeResult;
  readonly detail: string;
  readonly score?: number;
  readonly screenshotUrl?: string;
}

export function beforeOf(seed: BeforeSeed): AcceptanceCheck['before'] {
  return { result: seed.result, detail: seed.detail, score: seed.score ?? null, screenshotUrl: seed.screenshotUrl ?? null };
}

export interface CheckSeed {
  readonly project: string;
  readonly path: string;
  readonly runner: TestRunner | null;
  readonly onBase: BaseExpectation | null;
  readonly before: BeforeSeed;
}

/** A check whose content is frozen: it carries the hash the completion gate compares against. */
export function frozenCheck(seed: CheckSeed): AcceptanceCheck {
  return { path: seed.path, runner: seed.runner, sha256: contentHash(`${seed.project}:check:${seed.path}`), onBase: seed.onBase, before: beforeOf(seed.before) };
}

export function openCheck(seed: CheckSeed): AcceptanceCheck {
  return { path: seed.path, runner: seed.runner, sha256: null, onBase: seed.onBase, before: beforeOf(seed.before) };
}

export function attemptOf(run: RunView, index: number, kind: AttemptKind, outcome: AttemptOutcome, summary: string): Attempt {
  return { index, kind, runId: run.id, model: run.model, effort: run.effort, startedAt: run.startedAt, endedAt: run.endedAt, outcome, summary };
}

export function attemptsOf(runs: RunWorld, ...steps: readonly [string, AttemptKind, AttemptOutcome, string][]): Attempt[] {
  return steps.map(([runId, kind, outcome, summary], index) => attemptOf(runOf(runs, runId), index, kind, outcome, summary));
}

export function specOfProposal(proposal: ProposedSpec): IssueSpecView {
  return { need: proposal.need, acceptanceCriteria: [...proposal.acceptanceCriteria], outOfScope: [...proposal.outOfScope], expectedProof: proposal.expectedProof };
}

/** What the agent runs of an issue cost, summed. */
export function costOfIssue(runs: RunWorld, project: string, issueNumber: number): number {
  const total = runs.runs
    .filter((run) => run.project === project && run.subject.kind === 'issue' && run.subject.id === String(issueNumber))
    .reduce((sum, run) => sum + run.costUsd, 0);
  return Math.round(total * COST_PRECISION) / COST_PRECISION;
}
