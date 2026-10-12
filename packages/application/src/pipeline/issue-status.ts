import type { IssueState } from '@agent-factory/domain';
import type { PullRequestRef } from '../ports.ts';
import type { GateRecord, ReviewRecord } from './journal-events.ts';
import { attemptCounts, totalCostUsd, type AttemptCounts, type PipelineJournal } from './pipeline-journal.ts';

export interface IssueStatus {
  readonly issueNumber: number;
  readonly state: IssueState | null;
  readonly title: string | null;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly escalationReason: string | null;
  readonly beforeProof: string | null;
  readonly frozenChecks: readonly string[];
  readonly attempts: AttemptCounts;
  readonly lastGate: GateRecord | null;
  readonly lastReview: ReviewRecord | null;
  readonly pullRequest: PullRequestRef | null;
  readonly mergeSha: string | null;
  readonly costUsd: number;
}

function describeBeforeProof(journal: PipelineJournal): string | null {
  const record = journal.beforeProof;
  if (record === null) return null;
  return record.evaluation.valid ? `valid (${record.evaluation.kind})` : `invalid: ${record.evaluation.reason}`;
}

export function issueStatus(journal: PipelineJournal): IssueStatus {
  return {
    issueNumber: journal.issueNumber,
    state: journal.state,
    title: journal.spec?.title ?? null,
    branch: journal.branch,
    worktreePath: journal.worktree?.path ?? null,
    escalationReason: journal.state === 'needs-human' ? journal.escalationReason : null,
    beforeProof: describeBeforeProof(journal),
    frozenChecks: journal.frozen?.checks.map((check) => check.path) ?? [],
    attempts: attemptCounts(journal),
    lastGate: journal.gates.at(-1) ?? null,
    lastReview: journal.reviews.at(-1) ?? null,
    pullRequest: journal.pullRequest,
    mergeSha: journal.mergeSha,
    costUsd: totalCostUsd(journal),
  };
}
