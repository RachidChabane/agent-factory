import { decideNextAttempt } from '@agent-factory/domain';
import type { AttemptHistory, EffortLevel, RetryDecision } from '@agent-factory/domain';
import { distilFailures } from './failure-summary.ts';
import type { AttemptMode, FailureSource, ImplementerAttemptRecord, RetryRecord } from './journal-events.ts';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { attemptRecord, decisionAfter, decisionsOfEpoch, type PipelineJournal } from './pipeline-journal.ts';
import type { RoleProfile } from './pipeline-settings.ts';
import type { StageContext } from './stages/stage.ts';

export interface FailureReport {
  readonly source: FailureSource;
  readonly summary: string;
}

export interface AttemptPlan {
  readonly attempt: number;
  readonly mode: AttemptMode;
  readonly model: string;
  readonly effort: EffortLevel;
  readonly resumeSessionId: string | null;
  readonly correction: string | null;
  readonly earlierFailures: string | null;
}

function latestAttempts(journal: PipelineJournal): readonly ImplementerAttemptRecord[] {
  return [...new Map(journal.attempts.filter((record) => record.attempt >= journal.attemptEpoch).map((record) => [record.attempt, record])).values()];
}

export function attemptHistory(journal: PipelineJournal): AttemptHistory {
  const decisions = decisionsOfEpoch(journal);
  const resumes = decisions.filter((record) => record.decision.action === 'resume-same-session').length;
  const gateBlocks = latestAttempts(journal).reduce((sum, record) => sum + record.gateBlocks, 0);
  return {
    inSessionCorrections: resumes + gateBlocks,
    freshRestarts: decisions.filter((record) => record.decision.action === 'fresh-session-escalated').length,
  };
}

/**
 * The decision the attempt follows. An attempt that starts a cycle follows none, since the failures before it no longer
 * count, unless the operator's feedback started the cycle: the work then goes on from where the feedback found it.
 */
function decisionLeadingTo(journal: PipelineJournal, attempt: number): RetryRecord | null {
  const decision = decisionAfter(journal, attempt - 1);
  return attempt === journal.attemptEpoch && decision?.opensCycle !== true ? null : decision;
}

/** What a fresh session hears was rejected: all the operator's feedback so far, then the failures of the current cycle. */
function rejectionsBefore(journal: PipelineJournal, attempt: number): readonly RetryRecord[] {
  const feedback = journal.decisions.filter((record) => record.opensCycle);
  return [...feedback, ...decisionsOfEpoch(journal).filter((record) => record.afterAttempt < attempt)];
}

export function planAttempt(journal: PipelineJournal, attempt: number, profile: RoleProfile): AttemptPlan {
  const previousDecision = decisionLeadingTo(journal, attempt);
  const previousAttempt = previousDecision === null ? null : attemptRecord(journal, attempt - 1);
  if (previousDecision === null || previousDecision.decision.action === 'needs-human') {
    return { attempt, mode: 'initial', model: profile.model, effort: profile.effort, resumeSessionId: null, correction: null, earlierFailures: null };
  }
  const decision: RetryDecision = previousDecision.decision;
  if (decision.action === 'fresh-session-escalated') {
    return {
      attempt,
      mode: 'fresh-escalated',
      model: decision.profile.model,
      effort: decision.profile.effort,
      resumeSessionId: null,
      correction: null,
      earlierFailures: distilFailures(rejectionsBefore(journal, attempt)),
    };
  }
  const model = previousAttempt?.model ?? profile.model;
  const effort = previousAttempt?.effort ?? profile.effort;
  const sessionId = previousAttempt?.sessionId ?? null;
  return sessionId === null
    ? { attempt, mode: 'resumed', model, effort, resumeSessionId: null, correction: null, earlierFailures: distilFailures([previousDecision]) }
    : { attempt, mode: 'resumed', model, effort, resumeSessionId: sessionId, correction: previousDecision.failure.summary, earlierFailures: null };
}

export async function settleFailure(context: StageContext, attempt: number, failure: FailureReport): Promise<void> {
  const { journal, writer, toolkit } = context;
  const recorded = decisionAfter(journal, attempt);
  const decision = recorded?.decision ?? decideNextAttempt(attemptHistory(journal), toolkit.settings.implementerEscalation);
  if (recorded === null) {
    await writer.record(PIPELINE_EVENTS.retryDecided, { afterAttempt: attempt, failure, decision });
  }
  if (decision.action === 'needs-human') {
    await writer.escalate(
      `the ${failure.source} step failed on implementer attempt ${attempt + 1} and the retry budget is spent:\n${failure.summary}`,
    );
    return;
  }
  if (journal.state !== 'implementing') {
    await writer.transition('implementing', `the ${failure.source} step failed on attempt ${attempt + 1}; next: ${decision.action}`);
  }
}
