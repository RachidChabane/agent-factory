import type { IssueState } from '@agent-factory/domain';
import { FACTORY_WORK_DIRECTORY } from '../acceptance/acceptance-manifest.ts';
import { stoppedMessageExcerpt } from './failure-summary.ts';
import type { DecisionAnswerRecord, ImplementerAttemptRecord } from './journal-events.ts';
import type { PipelineJournal } from './pipeline-journal.ts';

export const DECISION_REQUEST_PATH = `${FACTORY_WORK_DIRECTORY}/human-decision.md`;
export const IMPLEMENTATION_ESCALATION_STATE: IssueState = 'implementing';

const PARAGRAPH = '\n\n';

export function decisionRequestReason(request: string): string {
  return `the implementer stopped to ask for a human decision:${PARAGRAPH}${stoppedMessageExcerpt(request)}`;
}

export function answeredDecisionPrompt(answer: string): string {
  return ['The operator answered your request for a decision:', answer.trim(), 'Continue the implementation with this decision.'].join(PARAGRAPH);
}

/** A question an implementer run stopped to ask, with the operator's answer to it. */
export interface OperatorDecision {
  readonly request: string;
  readonly answer: string;
}

/** What a run that stopped for a decision asked: its request file, or its last words when it wrote none. */
export function decisionRequestText(record: ImplementerAttemptRecord): string {
  return record.decisionRequest ?? record.finalTextTail;
}

/** Every decision the operator answered on the issue, oldest first: a session that did not hear them is told them all. */
export function operatorDecisionsOf(journal: PipelineJournal): readonly OperatorDecision[] {
  return journal.decisionAnswers.flatMap((answer) => {
    const asking = journal.attempts.find((record) => record.runId === answer.runId);
    return asking === undefined ? [] : [{ request: decisionRequestText(asking), answer: answer.answer }];
  });
}

export function operatorDecisionsAddendum(decisions: readonly OperatorDecision[]): string | null {
  if (decisions.length === 0) return null;
  const answered = decisions.flatMap(({ request, answer }) => ['An earlier attempt at this issue stopped to ask:', request.trim(), 'The operator answered:', answer.trim()]);
  return ['# Decisions from the operator', ...answered].join(PARAGRAPH);
}

export function answerFor(journal: PipelineJournal, runId: string): DecisionAnswerRecord | null {
  return journal.decisionAnswers.findLast((record) => record.runId === runId) ?? null;
}

export function pendingDecisionRequest(journal: PipelineJournal): ImplementerAttemptRecord | null {
  if (journal.stateBeforeEscalation !== IMPLEMENTATION_ESCALATION_STATE) return null;
  const latest = journal.attempts.at(-1);
  if (latest?.outcome !== 'decision-requested' || latest.attempt < journal.attemptEpoch) return null;
  return answerFor(journal, latest.runId) === null ? latest : null;
}
