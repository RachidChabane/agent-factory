import { argv, env, stdin, stdout } from 'node:process';
import type { GateResult } from '@agent-factory/domain';
import { evaluateCompletionGate, renderGateFeedback } from '../src/gate/completion-gate.ts';
import { readDecisionRequest } from '../src/gate/decision-request.ts';
import { appendGateDecision, DECISION_REQUESTED, type GateDecision } from '../src/gate/gate-decision.ts';
import { readGatePolicy } from '../src/gate/gate-policy.ts';
import { StopHookPayloadSchema, stopHookBlock, type StopHookPayload } from '../src/hooks/hook-payloads.ts';
import { policyPathFrom, readAll, writeJson } from '../src/hooks/hook-io.ts';

const GATE_UNAVAILABLE_FEEDBACK =
  'The completion gate could not be evaluated, so this work cannot be accepted yet. Summarise what you changed and stop.';
const GATE_UNAVAILABLE_STEP = 'gate-runtime';
const DECISION_REQUEST_STEP = 'decision-request';
const DECISION_REQUEST_DETAIL = 'the agent asked for a human decision, so the stop is let through without evaluating the gate';

async function main(): Promise<void> {
  const startedAt = Date.now();
  let payload: StopHookPayload | null = null;
  let decisionLogPath: string | null = null;
  try {
    payload = StopHookPayloadSchema.parse(JSON.parse(await readAll(stdin)));
    const policy = await readGatePolicy(policyPathFrom(argv));
    decisionLogPath = policy.decisionLogPath;
    if ((await readDecisionRequest(policy.decisionRequestFile)) !== null) {
      await appendGateDecision(policy.decisionLogPath, decisionRequestedDecision(payload, startedAt));
      return;
    }
    const result = await evaluateCompletionGate(policy, { env });
    await appendGateDecision(policy.decisionLogPath, evaluatedDecision(result, payload, startedAt));
    if (!result.passed) {
      await writeJson(stdout, stopHookBlock(renderGateFeedback(result)));
    }
  } catch (error) {
    await recordUnavailable(decisionLogPath, payload, startedAt, error);
    await writeJson(stdout, stopHookBlock(GATE_UNAVAILABLE_FEEDBACK));
  }
}

function evaluatedDecision(result: GateResult, payload: StopHookPayload, startedAt: number): GateDecision {
  return {
    decidedAt: new Date().toISOString(),
    sessionId: payload.session_id,
    stopHookActive: payload.stop_hook_active,
    passed: result.passed,
    failure: result.passed ? null : 'gate-failed',
    durationMs: Date.now() - startedAt,
    steps: result.steps.map((step) => ({ ...step })),
  };
}

function decisionRequestedDecision(payload: StopHookPayload, startedAt: number): GateDecision {
  return {
    decidedAt: new Date().toISOString(),
    sessionId: payload.session_id,
    stopHookActive: payload.stop_hook_active,
    passed: false,
    failure: DECISION_REQUESTED,
    durationMs: Date.now() - startedAt,
    steps: [{ name: DECISION_REQUEST_STEP, outcome: 'skipped', detail: DECISION_REQUEST_DETAIL }],
  };
}

async function recordUnavailable(
  decisionLogPath: string | null,
  payload: StopHookPayload | null,
  startedAt: number,
  error: unknown,
): Promise<void> {
  if (decisionLogPath === null) {
    return;
  }
  try {
    await appendGateDecision(decisionLogPath, {
      decidedAt: new Date().toISOString(),
      sessionId: payload?.session_id ?? null,
      stopHookActive: payload?.stop_hook_active ?? null,
      passed: false,
      failure: 'gate-unavailable',
      durationMs: Date.now() - startedAt,
      steps: [{ name: GATE_UNAVAILABLE_STEP, outcome: 'failed', detail: String(error) }],
    });
  } catch {
    return;
  }
}

await main();
