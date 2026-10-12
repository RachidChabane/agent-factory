import { ISSUE_ABANDONED_STATE, ISSUE_ESCALATION_STATE } from '@agent-factory/domain';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { IssueJournalWriter } from './journal-writer.ts';
import type { PipelineDependencies } from './pipeline-dependencies.ts';
import { AbandonRefusedError } from './pipeline-errors.ts';
import { loadJournal } from './pipeline-journal.ts';

const REASON_REQUIRED = 'the operator must give the reason for abandoning it';

export type AbandonIssueDependencies = Pick<PipelineDependencies, 'pool' | 'events' | 'states'>;

export interface AbandonOrder {
  readonly issueNumber: number;
  readonly operator: string;
  readonly reason: string;
}

export interface AbandonOutcome {
  readonly issueNumber: number;
  readonly releasedWorktree: string | null;
  readonly branch: string | null;
  readonly openPullRequest: number | null;
}

export function abandonmentReason(operator: string, reason: string): string {
  return `abandoned by ${operator}: ${reason}`;
}

export class AbandonIssue {
  private readonly dependencies: AbandonIssueDependencies;

  constructor(dependencies: AbandonIssueDependencies) {
    this.dependencies = dependencies;
  }

  async abandon(order: AbandonOrder): Promise<AbandonOutcome> {
    const { events, states, pool } = this.dependencies;
    const journal = await loadJournal(events, order.issueNumber);
    if (journal.state !== ISSUE_ESCALATION_STATE) {
      throw new AbandonRefusedError(order.issueNumber, `it is ${journal.state ?? 'unknown to the factory'}, not ${ISSUE_ESCALATION_STATE}`);
    }
    const reason = order.reason.trim();
    if (reason === '') throw new AbandonRefusedError(order.issueNumber, REASON_REQUIRED);
    const writer = new IssueJournalWriter(events, states, order.issueNumber);
    const worktree = journal.worktree;
    if (worktree !== null) {
      await pool.release(worktree);
      await writer.record(PIPELINE_EVENTS.worktreeReleased, { path: worktree.path });
    }
    await writer.transition(ISSUE_ABANDONED_STATE, abandonmentReason(order.operator, reason));
    const openPullRequest = journal.pullRequest !== null && journal.mergeSha === null ? journal.pullRequest.number : null;
    return { issueNumber: order.issueNumber, releasedWorktree: worktree?.path ?? null, branch: journal.branch ?? worktree?.branch ?? null, openPullRequest };
  }
}
