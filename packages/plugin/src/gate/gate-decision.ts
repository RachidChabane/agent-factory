import { appendFile } from 'node:fs/promises';
import { GATE_STEP_OUTCOMES } from '@agent-factory/domain';
import { z } from 'zod';

export const GATE_DECISION_FAILURES = ['gate-failed', 'gate-unavailable', 'decision-requested'] as const;
export const DECISION_REQUESTED: (typeof GATE_DECISION_FAILURES)[number] = 'decision-requested';

export const GateDecisionSchema = z.object({
  decidedAt: z.string(),
  sessionId: z.string().nullable(),
  stopHookActive: z.boolean().nullable(),
  passed: z.boolean(),
  failure: z.enum(GATE_DECISION_FAILURES).nullable(),
  durationMs: z.number().nonnegative(),
  steps: z.array(
    z.object({
      name: z.string(),
      outcome: z.enum(GATE_STEP_OUTCOMES),
      detail: z.string(),
    }),
  ),
});

export type GateDecision = z.infer<typeof GateDecisionSchema>;

const LOG_FILE_MODE = 0o600;

export async function appendGateDecision(decisionLogPath: string, decision: GateDecision): Promise<void> {
  await appendFile(decisionLogPath, `${JSON.stringify(decision)}\n`, { mode: LOG_FILE_MODE });
}

export function isDecisionRequest(decision: GateDecision): boolean {
  return !decision.passed && decision.failure === DECISION_REQUESTED;
}

export function isBlockedStop(decision: GateDecision): boolean {
  return !decision.passed && !isDecisionRequest(decision);
}

export function parseGateDecisionLog(content: string): readonly GateDecision[] {
  return content
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => GateDecisionSchema.parse(JSON.parse(line)));
}
