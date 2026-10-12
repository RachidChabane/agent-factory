import { decideNextAttempt, FEEDBACK_STATES } from '@agent-factory/domain';
import type { EscalationProfile, ReviewFinding } from '@agent-factory/domain';
import type { Clock } from '../ports.ts';
import { reviewFailureSummary } from './failure-summary.ts';
import { PIPELINE_EVENTS, type ExternalFeedbackRecord } from './journal-events.ts';
import { IssueJournalWriter } from './journal-writer.ts';
import { issueOfPullRequest } from './merge-on-order.ts';
import type { PipelineDependencies } from './pipeline-dependencies.ts';
import { currentAttempt, loadJournal } from './pipeline-journal.ts';
import { attemptHistory } from './retry.ts';

export const FEEDBACK_FINDING_CATEGORY = 'correctness';
export const BLOCKING = 'blocking';

export type PullRequestFeedbackDependencies = Pick<PipelineDependencies, 'events' | 'states' | 'ids'> & { readonly clock: Clock };

export interface ExternalFeedbackInput {
  readonly pullRequestNumber: number;
  readonly author: string;
  readonly source: string;
  readonly body: string;
}

export type FeedbackOutcome =
  | { readonly kind: 'cycle-started'; readonly issueNumber: number; readonly attempt: number }
  | { readonly kind: 'needs-human'; readonly issueNumber: number; readonly reason: string };

export class FeedbackRefusedError extends Error {
  constructor(pullRequestNumber: number, reason: string) {
    super(`Feedback on pull request #${pullRequestNumber} cannot start a new cycle: ${reason}`);
    this.name = 'FeedbackRefusedError';
  }
}

export function feedbackFindings(author: string, body: string): readonly ReviewFinding[] {
  return [{ severity: BLOCKING, category: FEEDBACK_FINDING_CATEGORY, file: null, line: null, summary: `${author}: ${body.trim()}` }];
}

export class PullRequestFeedback {
  private readonly dependencies: PullRequestFeedbackDependencies;
  private readonly escalation: EscalationProfile;

  constructor(dependencies: PullRequestFeedbackDependencies, escalation: EscalationProfile) {
    this.dependencies = dependencies;
    this.escalation = escalation;
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
    const decision = decideNextAttempt(attemptHistory(journal), this.escalation);
    const cycleStarted = decision.action !== 'needs-human';
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
      cycleStarted,
    };
    await writer.record(PIPELINE_EVENTS.externalFeedbackReceived, record);
    const reason = `${input.author} reviewed pull request #${input.pullRequestNumber} and asked for changes`;
    if (journal.state === 'pr-open') await writer.transition('ci', reason);
    await writer.transition('implementing', reason);
    if (cycleStarted) {
      await writer.record(PIPELINE_EVENTS.retryDecided, {
        afterAttempt: attempt,
        failure: { source: 'review', summary: reviewFailureSummary(findings) },
        decision,
      });
      return { kind: 'cycle-started', issueNumber, attempt: attempt + 1 };
    }
    const escalation = `${reason}, but the implementer retry budget is spent; "factory resume ${issueNumber}" grants one fresh session on the escalation profile to address it:\n${reviewFailureSummary(findings)}`;
    await writer.escalate(escalation);
    return { kind: 'needs-human', issueNumber, reason: escalation };
  }
}
