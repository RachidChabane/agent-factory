import { isDeepStrictEqual } from 'node:util';
import { ISSUE_CHECK_REWRITE_STATE, ISSUE_ESCALATION_STATE } from '@agent-factory/domain';
import type { IssueState } from '@agent-factory/domain';
import { authorOf, delegationFields, type Delegation } from '../autonomy/delegation.ts';
import type { ProjectConventions } from '../conventions/project-conventions.ts';
import { isSpecValidated } from '../spec/markdown-spec-reader.ts';
import { issueBranchName } from './branch-name.ts';
import { pendingDecisionRequest } from './decision-request.ts';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { IssueJournalWriter } from './journal-writer.ts';
import type { PipelineDependencies } from './pipeline-dependencies.ts';
import { ResumeRefusedError, SpecNotValidatedError } from './pipeline-errors.ts';
import { currentAttempt, decisionAfter, decisionsOfEpoch, gateRecord, loadJournal, type PipelineJournal } from './pipeline-journal.ts';

export const STATES_BEFORE_FROZEN_CHECKS: readonly IssueState[] = ['spec-draft', 'spec-validated', 'blocked', 'authoring-checks'];
export const AUTHORING_STATE: IssueState = 'authoring-checks';
const REVIEW_AGAIN_REASON = 'the operator ordered a new review of the same implementation';

const SPENT_RETRY_BUDGET = 'the implementer retry budget is spent, so the issue would escalate again; the change needs a human';
const FROZEN_CHECKS_VIOLATED = 'a frozen acceptance check was modified or deleted; only the operator can have the checks rewritten';
const ANSWER_REQUIRED = 'the implementer asked for a decision, so the resume needs the operator\'s answer';
const NOTHING_TO_ANSWER = 'it does not wait on a decision, so there is nothing to answer';
const REVIEW_AGAIN_FROM_REVIEW = 'the escalation did not come from the review stage, so there is no review to run again';
const REVIEW_AGAIN_FROM_REVIEW_FAILURE = 'the escalation was not caused by a blocking review';
const REVIEW_AGAIN_GATE_NOT_PASSED = 'the gate of the latest attempt did not pass, so there is no implementation to review';

function repeatedEscalation(journal: PipelineJournal): string | null {
  if (decisionsOfEpoch(journal).some((record) => record.decision.action === 'needs-human')) return SPENT_RETRY_BUDGET;
  if (journal.gates.some((record) => record.attempt >= journal.attemptEpoch && record.violations.length > 0)) return FROZEN_CHECKS_VIOLATED;
  return null;
}

/** Why the review of the current attempt cannot be run again, or null: it must have ended the issue on a passing gate. */
function reviewAgainRefusal(journal: PipelineJournal, attempt: number): string | null {
  if (journal.stateBeforeEscalation !== 'reviewing') return REVIEW_AGAIN_FROM_REVIEW;
  const decision = decisionAfter(journal, attempt);
  if (decision === null || decision.decision.action !== 'needs-human' || decision.failure.source !== 'review') return REVIEW_AGAIN_FROM_REVIEW_FAILURE;
  const gate = gateRecord(journal, attempt);
  if (gate === null || !gate.result.passed || gate.violations.length > 0) return REVIEW_AGAIN_GATE_NOT_PASSED;
  return null;
}

export type ResumeIssueDependencies = Pick<PipelineDependencies, 'github' | 'specReader' | 'pool' | 'events' | 'states'>;

export interface ResumeOutcome {
  readonly issueNumber: number;
  readonly resumedAt: IssueState;
  readonly specChanged: boolean;
  readonly checksReauthored: boolean;
  readonly decisionAnswered: boolean;
}

export interface ReviewAgainOutcome {
  readonly issueNumber: number;
  readonly attempt: number;
}

export interface ResumeIssueSettings {
  readonly conventions: ProjectConventions;
}

export class ResumeIssue {
  private readonly dependencies: ResumeIssueDependencies;
  private readonly conventions: ProjectConventions;

  constructor(dependencies: ResumeIssueDependencies, settings: ResumeIssueSettings) {
    this.dependencies = dependencies;
    this.conventions = settings.conventions;
  }

  /**
   * Orders a new review of the implementation an escalated issue already has, in a fresh context and on the same
   * head. The reviews of the attempt recorded so far stop counting and no implementer attempt is spent; a review
   * that blocks again escalates the issue again, without a new retry decision.
   */
  async reviewAgain(issueNumber: number, operator: string): Promise<ReviewAgainOutcome> {
    const { events, states } = this.dependencies;
    const journal = await loadJournal(events, issueNumber);
    if (journal.state !== ISSUE_ESCALATION_STATE) {
      throw new ResumeRefusedError(issueNumber, `it is ${journal.state ?? 'unknown to the factory'}, not ${ISSUE_ESCALATION_STATE}`);
    }
    const attempt = currentAttempt(journal);
    const refusal = reviewAgainRefusal(journal, attempt);
    if (refusal !== null) throw new ResumeRefusedError(issueNumber, refusal);
    const writer = new IssueJournalWriter(events, states, issueNumber);
    await writer.record(PIPELINE_EVENTS.reviewReordered, { attempt, operator });
    await writer.transition('reviewing', REVIEW_AGAIN_REASON);
    return { issueNumber, attempt };
  }

  /** Resumes an escalated issue: the operator's gesture, or the delegate's when `delegation` names it. */
  async resume(issueNumber: number, answer: string | null = null, delegation: Delegation | null = null): Promise<ResumeOutcome> {
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
    const writer = new IssueJournalWriter(events, states, issueNumber);
    if (decision !== null) await writer.record(PIPELINE_EVENTS.decisionAnswered, { runId: decision.runId, answer: operatorAnswer, ...delegationFields(delegation) });
    let specChanged = false;
    if (STATES_BEFORE_FROZEN_CHECKS.includes(target)) {
      const issue = await github.getIssue(issueNumber);
      if (!isSpecValidated(issue, this.conventions)) throw new SpecNotValidatedError(issueNumber, this.conventions.labels.validated);
      const spec = specReader.read(issue);
      specChanged = !isDeepStrictEqual(spec, journal.spec);
      if (specChanged) {
        await writer.record(PIPELINE_EVENTS.specCaptured, { spec, branch: journal.branch ?? issueBranchName(this.conventions.branchPrefix, spec.number, spec.title) });
      }
    }
    const pendingRewrite = journal.checkRewrite;
    if (target === ISSUE_CHECK_REWRITE_STATE && pendingRewrite !== null) {
      await writer.record(PIPELINE_EVENTS.checkRewriteOrdered, { ...pendingRewrite.order, fromState: ISSUE_ESCALATION_STATE });
    }
    const branch = journal.branch;
    const checksReauthored = target === AUTHORING_STATE && branch !== null;
    if (checksReauthored) {
      await writer.record(PIPELINE_EVENTS.authoringRestarted, { reason: `${authorOf(delegation)} resumed the issue before its checks were frozen` });
      await writer.record(PIPELINE_EVENTS.worktreeAcquired, await pool.acquire(issueNumber, branch));
    }
    await writer.transition(target, `${authorOf(delegation)} resumed the issue`);
    return {
      issueNumber,
      resumedAt: target,
      specChanged,
      checksReauthored,
      decisionAnswered: decision !== null,
    };
  }
}
