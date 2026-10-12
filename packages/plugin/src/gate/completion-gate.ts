import type { GateResult, GateStepResult } from '@agent-factory/domain';
import { summariseFailureOutput } from '../text/failure-summary.ts';
import { verifyFrozenChecks, type FrozenCheckViolation } from './frozen-checks.ts';
import { runGateCommand, type GateCommandRun } from './gate-command.ts';
import type { GatePolicy } from './gate-policy.ts';

export const GATE_STEPS = {
  frozenChecks: { name: 'frozen-checks', label: 'Frozen acceptance checks' },
  verification: { name: 'verification', label: 'Verification' },
} as const;

const FEEDBACK_HEADER = 'The completion gate failed. Fix what is reported below, then finish again.';
const FROZEN_CHECKS_FAILURE = 'These acceptance checks are frozen and no longer match their frozen content:';
const VERIFICATION_TIMED_OUT = 'did not finish in time.';
const NO_OUTPUT = '(no output)';
const SKIPPED_AFTER_FAILURE = 'skipped because an earlier step failed';
const NOT_CONFIGURED = 'not configured';
const STEP_PASSED = 'passed';
const SUCCESS_EXIT_CODE = 0;

export interface CompletionGateEnvironment {
  readonly env: NodeJS.ProcessEnv;
}

export async function evaluateCompletionGate(
  policy: GatePolicy,
  environment: CompletionGateEnvironment,
): Promise<GateResult> {
  const frozenStep = frozenChecksStep(await verifyFrozenChecks(policy.worktree, policy.frozenChecks));
  const verificationStep = await verificationStepAfter(frozenStep, policy, environment);
  const steps = [frozenStep, verificationStep];
  return { passed: steps.every((step) => step.outcome !== 'failed'), steps };
}

export function renderGateFeedback(result: GateResult): string {
  const failures = result.steps.filter((step) => step.outcome === 'failed').map((step) => step.detail);
  return [FEEDBACK_HEADER, ...failures].join('\n\n');
}

function frozenChecksStep(violations: readonly FrozenCheckViolation[]): GateStepResult {
  const { name, label } = GATE_STEPS.frozenChecks;
  if (violations.length === 0) {
    return { name, outcome: 'passed', detail: STEP_PASSED };
  }
  const listing = violations.map((violation) => `- ${violation.path} (${violation.kind})`);
  return { name, outcome: 'failed', detail: [`${label}: ${FROZEN_CHECKS_FAILURE}`, ...listing].join('\n') };
}

async function verificationStepAfter(
  frozenStep: GateStepResult,
  policy: GatePolicy,
  environment: CompletionGateEnvironment,
): Promise<GateStepResult> {
  const { name } = GATE_STEPS.verification;
  if (frozenStep.outcome === 'failed') {
    return { name, outcome: 'skipped', detail: SKIPPED_AFTER_FAILURE };
  }
  if (policy.gateCommand === null) {
    return { name, outcome: 'skipped', detail: NOT_CONFIGURED };
  }
  const run = await runGateCommand({
    command: policy.gateCommand,
    cwd: policy.worktree,
    timeoutMs: policy.gateTimeoutMs,
    env: environment.env,
  });
  return verificationResult(run);
}

function verificationResult(run: GateCommandRun): GateStepResult {
  const { name, label } = GATE_STEPS.verification;
  if (!run.timedOut && run.exitCode === SUCCESS_EXIT_CODE) {
    return { name, outcome: 'passed', detail: STEP_PASSED };
  }
  const headline = run.timedOut ? `${label} ${VERIFICATION_TIMED_OUT}` : `${label} failed (exit code ${String(run.exitCode)}).`;
  const tail = summariseFailureOutput(run.outputTail);
  return { name, outcome: 'failed', detail: `${headline}\n${tail === '' ? NO_OUTPUT : tail}` };
}
