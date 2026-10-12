import type { AgentRunOutcome } from '@agent-factory/application';
import { isBlockedStop, isDecisionRequest, type GateDecision } from '@agent-factory/plugin';
import type { TerminationReason } from './process-supervisor.ts';
import type { ResultLine } from './stream/stream-schemas.ts';

const RESULT_SUBTYPE_OUTCOMES: Readonly<Record<string, AgentRunOutcome>> = {
  success: 'success',
  error_max_turns: 'max-turns',
  error_max_budget_usd: 'budget-exceeded',
  error_during_execution: 'error',
};

const TERMINATION_OUTCOMES: Readonly<Record<Exclude<TerminationReason, 'exited'>, AgentRunOutcome>> = {
  timeout: 'timeout',
  aborted: 'aborted',
};

export interface StopHookResponse {
  readonly blocked: boolean;
}

export interface GateEvidence {
  readonly decisions: readonly GateDecision[];
  readonly stopHookResponses: readonly StopHookResponse[];
}

export function outcomeOfResult(result: ResultLine): AgentRunOutcome {
  const outcome = RESULT_SUBTYPE_OUTCOMES[result.subtype] ?? 'error';
  return outcome === 'success' && result.is_error ? 'error' : outcome;
}

function lastStopReleased(evidence: GateEvidence, released: (decision: GateDecision) => boolean): boolean {
  const lastDecision = evidence.decisions.at(-1);
  const lastResponse = evidence.stopHookResponses.at(-1);
  return (
    lastDecision !== undefined &&
    released(lastDecision) &&
    lastResponse?.blocked === false &&
    evidence.decisions.length === evidence.stopHookResponses.length
  );
}

export function gateSatisfied(evidence: GateEvidence): boolean {
  return lastStopReleased(evidence, (decision) => decision.passed);
}

export function decisionRequested(evidence: GateEvidence): boolean {
  return lastStopReleased(evidence, isDecisionRequest);
}

export interface RunConclusion {
  readonly termination: TerminationReason;
  readonly result: ResultLine | null;
  readonly gateRequired: boolean;
  readonly gate: GateEvidence;
  readonly tamperedRunFiles: readonly string[];
}

export function gateBlocksOf(decisions: readonly GateDecision[]): number {
  return decisions.filter(isBlockedStop).length;
}

export function decideOutcome(conclusion: RunConclusion): AgentRunOutcome {
  if (conclusion.termination !== 'exited') {
    return TERMINATION_OUTCOMES[conclusion.termination];
  }
  if (conclusion.result === null || conclusion.tamperedRunFiles.length > 0) {
    return 'error';
  }
  const outcome = outcomeOfResult(conclusion.result);
  if (outcome !== 'success' || !conclusion.gateRequired || gateSatisfied(conclusion.gate)) return outcome;
  return decisionRequested(conclusion.gate) ? 'decision-requested' : 'error';
}
