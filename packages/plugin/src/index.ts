export { HOOK_SCRIPTS } from './hook-scripts.ts';
export { GatePolicySchema, FrozenCheckSchema, readGatePolicy, type GatePolicy } from './gate/gate-policy.ts';
export {
  GateDecisionSchema,
  GATE_DECISION_FAILURES,
  DECISION_REQUESTED,
  appendGateDecision,
  isBlockedStop,
  isDecisionRequest,
  parseGateDecisionLog,
  type GateDecision,
} from './gate/gate-decision.ts';
export { readDecisionRequest } from './gate/decision-request.ts';
export { GATE_STEPS, evaluateCompletionGate, renderGateFeedback } from './gate/completion-gate.ts';
export { verifyFrozenChecks, sha256Hex, FROZEN_CHECK_VIOLATIONS, type FrozenCheckViolation } from './gate/frozen-checks.ts';
export { runGateCommand, type GateCommandRun } from './gate/gate-command.ts';
export {
  StopHookPayloadSchema,
  StopHookBlockOutputSchema,
  PreToolUseHookPayloadSchema,
  STOP_HOOK_EVENT,
  PRE_TOOL_USE_HOOK_EVENT,
  BLOCKING_HOOK_EXIT_CODE,
  isStopBlock,
  type StopHookPayload,
  type PreToolUseHookPayload,
} from './hooks/hook-payloads.ts';
export { POLICY_ARGUMENT } from './hooks/hook-io.ts';
export { decideFrozenWrite } from './hooks/frozen-write-guard.ts';
export { canonicalPath, isWithin } from './paths/canonical-path.ts';
export { signalProcessGroup } from './process/process-group.ts';
export { BoundedTail, lastLines } from './text/bounded-tail.ts';
export { FAILURE_OUTPUT_TAIL_LINES, summariseFailureOutput, stripTerminalControls } from './text/failure-summary.ts';
