import { FEEDBACK_STATES } from '@agent-factory/domain';
import type { ReviewFinding } from '@agent-factory/domain';
import type { Clock } from '../ports.ts';
import { reviewFailureSummary } from './failure-summary.ts';
import { PIPELINE_EVENTS, type ExternalFeedbackRecord } from './journal-events.ts';
import { IssueJournalWriter } from './journal-writer.ts';
import { issueOfPullRequest } from './merge-on-order.ts';
import type { PipelineDependencies } from './pipeline-dependencies.ts';
import { currentAttempt, loadJournal } from './pipeline-journal.ts';

export const FEEDBACK_FINDING_CATEGORY = 'correctness';
export const BLOCKING = 'blocking';

export type PullRequestFeedbackDependencies = Pick<PipelineDependencies, 'events' | 'states' | 'ids'> & { readonly clock: Clock };

export interface ExternalFeedbackInput {
  readonly pullRequestNumber: number;
  readonly author: string;
  readonly source: string;
  readonly body: string;
}

export interface FeedbackOutcome {
  readonly issueNumber: number;
  /** The attempt the feedback starts, counted from zero. */
  readonly attempt: number;
}

export class FeedbackRefusedError extends Error {
  constructor(pullRequestNumber: number, reason: string) {
    super(`Feedback on pull request #${pullRequestNumber} cannot start a new cycle: ${reason}`);
    this.name = 'FeedbackRefusedError';
  }
}

export function feedbackFindings(author: string, body: string): readonly ReviewFinding[] {
  return [{ severity: BLOCKING, category: FEEDBACK_FINDING_CATEGORY, file: null, line: null, summary: `${author}: ${body.trim()}` }];
}

/**
 * The operator's feedback on a pull request that awaits review. It sends the issue back to its implementer, who goes on in
 * the session the pull request came from, and it opens a cycle with the whole failure budget: feedback is a gesture of
 * the operator, never a failure, so the failures before it do not refuse it and it spends none of the budget.
 */
export class PullRequestFeedback {
  private readonly dependencies: PullRequestFeedbackDependencies;

  constructor(dependencies: PullRequestFeedbackDependencies) {
    this.dependencies = dependencies;
  }

  async record(input: ExternalFeedbackInput): Promise<FeedbackOutcome> {
    const { events, states, ids, clock } = this.dependencies;
    const issueNumber = await issueOfPullRequest(events, input.pullRequestNumber);
    const journal = await loadJournal(events, issueNumber);
    if (journal.state === null || !FEEDBACK_STATES.includes(journal.state)) {
      throw new FeedbackRefusedError(input.pullRequestNumber, `issue #${issueNumber} is ${journal.state ?? 'unknown'}, not awaiting review`);
    }
    const attempt = currentAttempt(journal);
    const findings = feedbackFindings(input.author, input.body);
    const writer = new IssueJournalWriter(events, states, issueNumber);
    const record: ExternalFeedbackRecord = {
      id: ids.next(),
      author: input.author,
      source: input.source,
      body: input.body,
      receivedAt: clock.now().toISOString(),
      pullRequestNumber: input.pullRequestNumber,
      afterAttempt: attempt,
      findings: [...findings],
      cycleStarted: true,
    };
    await writer.record(PIPELINE_EVENTS.externalFeedbackReceived, record);
    await writer.record(PIPELINE_EVENTS.retryDecided, {
      afterAttempt: attempt,
      failure: { source: 'review', summary: reviewFailureSummary(findings) },
      decision: { action: 'resume-same-session' },
      opensCycle: true,
    });
    const reason = `${input.author} reviewed pull request #${input.pullRequestNumber} and asked for changes`;
    if (journal.state === 'pr-open') await writer.transition('ci', reason);
    await writer.transition('implementing', reason);
    return { issueNumber, attempt: attempt + 1 };
  }
}
