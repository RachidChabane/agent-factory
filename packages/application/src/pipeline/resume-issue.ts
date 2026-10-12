import { isDeepStrictEqual } from 'node:util';
import { ISSUE_CHECK_REWRITE_STATE, ISSUE_ESCALATION_STATE } from '@agent-factory/domain';
import type { EscalationProfile, IssueState } from '@agent-factory/domain';
import { reviewFailureSummary } from './failure-summary.ts';
import { isSpecValidated } from '../spec/markdown-spec-reader.ts';
import { SPEC_VALIDATED_LABEL } from '../spec/spec-format.ts';
import { issueBranchName } from './branch-name.ts';
import { pendingDecisionRequest } from './decision-request.ts';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { IssueJournalWriter } from './journal-writer.ts';
import type { PipelineDependencies } from './pipeline-dependencies.ts';
import { ResumeRefusedError, SpecNotValidatedError } from './pipeline-errors.ts';
import { decisionsOfEpoch, loadJournal, pendingFeedback, type PipelineJournal } from './pipeline-journal.ts';

export const STATES_BEFORE_FROZEN_CHECKS: readonly IssueState[] = ['spec-draft', 'spec-validated', 'blocked', 'authoring-checks'];
export const AUTHORING_STATE: IssueState = 'authoring-checks';
const RESUME_REASON = 'the operator resumed the issue';
const RESTART_REASON = 'the operator resumed the issue before its checks were frozen';

const SPENT_RETRY_BUDGET = 'the implementer retry budget is spent, so the issue would escalate again; the change needs a human';
const FROZEN_CHECKS_VIOLATED = 'a frozen acceptance check was modified or deleted; only the operator can have the checks rewritten';
const NO_ESCALATION_PROFILE = 'external feedback waits for a fresh session but no escalation profile was given';
const ANSWER_REQUIRED = 'the implementer asked for a decision, so the resume needs the operator\'s answer';
const NOTHING_TO_ANSWER = 'it does not wait on a decision, so there is nothing to answer';

function repeatedEscalation(journal: PipelineJournal): string | null {
  if (decisionsOfEpoch(journal).some((record) => record.decision.action === 'needs-human')) return SPENT_RETRY_BUDGET;
  if (journal.gates.some((record) => record.attempt >= journal.attemptEpoch && record.violations.length > 0)) return FROZEN_CHECKS_VIOLATED;
  return null;
}

export type ResumeIssueDependencies = Pick<PipelineDependencies, 'github' | 'specReader' | 'pool' | 'events' | 'states'>;

export interface ResumeOutcome {
  readonly issueNumber: number;
  readonly resumedAt: IssueState;
  readonly specChanged: boolean;
  readonly checksReauthored: boolean;
  readonly feedbackCycleGranted: boolean;
  readonly decisionAnswered: boolean;
}

export class ResumeIssue {
  private readonly dependencies: ResumeIssueDependencies;
  private readonly escalation: EscalationProfile | null;

  constructor(dependencies: ResumeIssueDependencies, escalation: EscalationProfile | null = null) {
    this.dependencies = dependencies;
    this.escalation = escalation;
  }

  async resume(issueNumber: number, answer: string | null = null): Promise<ResumeOutcome> {
    const { events, states, github, specReader, pool } = this.dependencies;
    const journal = await loadJournal(events, issueNumber);
    if (journal.state !== ISSUE_ESCALATION_STATE) {
      throw new ResumeRefusedError(issueNumber, `it is ${journal.state ?? 'unknown to the factory'}, not ${ISSUE_ESCALATION_STATE}`);
    }
    const target = journal.stateBeforeEscalation;
    if (target === null) throw new ResumeRefusedError(issueNumber, 'no state was recorded before the escalation');
    const repeated = STATES_BEFORE_FROZEN_CHECKS.includes(target) || target === ISSUE_CHECK_REWRITE_STATE ? null : repeatedEscalation(journal);
    if (repeated !== null) throw new ResumeRefusedError(issueNumber, repeated);
    const decision = pendingDecisionRequest(journal);
    const operatorAnswer = answer?.trim() ?? '';
    if (decision !== null && operatorAnswer === '') throw new ResumeRefusedError(issueNumber, ANSWER_REQUIRED);
    if (decision === null && operatorAnswer !== '') throw new ResumeRefusedError(issueNumber, NOTHING_TO_ANSWER);
    const feedback = pendingFeedback(journal);
    if (feedback !== null && this.escalation === null) throw new ResumeRefusedError(issueNumber, NO_ESCALATION_PROFILE);
    const writer = new IssueJournalWriter(events, states, issueNumber);
    if (decision !== null) await writer.record(PIPELINE_EVENTS.decisionAnswered, { runId: decision.runId, answer: operatorAnswer });
    let specChanged = false;
    if (STATES_BEFORE_FROZEN_CHECKS.includes(target)) {
      const issue = await github.getIssue(issueNumber);
      if (!isSpecValidated(issue)) throw new SpecNotValidatedError(issueNumber, SPEC_VALIDATED_LABEL);
      const spec = specReader.read(issue);
      specChanged = !isDeepStrictEqual(spec, journal.spec);
      if (specChanged) {
        await writer.record(PIPELINE_EVENTS.specCaptured, { spec, branch: journal.branch ?? issueBranchName(spec.number, spec.title) });
      }
    }
    const pendingRewrite = journal.checkRewrite;
    if (target === ISSUE_CHECK_REWRITE_STATE && pendingRewrite !== null) {
      await writer.record(PIPELINE_EVENTS.checkRewriteOrdered, { ...pendingRewrite.order, fromState: ISSUE_ESCALATION_STATE });
    }
    const branch = journal.branch;
    const checksReauthored = target === AUTHORING_STATE && branch !== null;
    if (checksReauthored) {
      await writer.record(PIPELINE_EVENTS.authoringRestarted, { reason: RESTART_REASON });
      await writer.record(PIPELINE_EVENTS.worktreeAcquired, await pool.acquire(issueNumber, branch));
    }
    if (feedback !== null && this.escalation !== null) {
      await writer.record(PIPELINE_EVENTS.retryDecided, {
        afterAttempt: feedback.afterAttempt,
        failure: { source: 'review', summary: reviewFailureSummary(feedback.findings) },
        decision: { action: 'fresh-session-escalated', profile: this.escalation },
      });
    }
    await writer.transition(target, RESUME_REASON);
    return {
      issueNumber,
      resumedAt: target,
      specChanged,
      checksReauthored,
      decisionAnswered: decision !== null,
      feedbackCycleGranted: feedback !== null,
    };
  }
}
