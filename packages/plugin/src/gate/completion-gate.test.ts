import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GATE_STEPS, evaluateCompletionGate, renderGateFeedback } from './completion-gate.ts';
import { sha256Hex } from './frozen-checks.ts';
import type { GatePolicy } from './gate-policy.ts';

const CHECK_PATH = 'sum.test.ts';
const CHECK_CONTENT = 'frozen check\n';
const GATE_TIMEOUT_MS = 10_000;

describe('evaluateCompletionGate', () => {
  let worktree: string;

  beforeEach(async () => {
    worktree = await mkdtemp(join(tmpdir(), 'completion-gate-'));
    await writeFile(join(worktree, CHECK_PATH), CHECK_CONTENT);
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  function policy(overrides: Partial<GatePolicy>): GatePolicy {
    return {
      worktree,
      frozenChecks: [{ path: CHECK_PATH, sha256: sha256Hex(CHECK_CONTENT) }],
      gateCommand: 'exit 0',
      gateTimeoutMs: GATE_TIMEOUT_MS,
      decisionLogPath: join(worktree, 'unused.jsonl'),
      decisionRequestFile: null,
      ...overrides,
    };
  }

  it('passes when frozen checks are intact and the command succeeds', async () => {
    const result = await evaluateCompletionGate(policy({}), { env: process.env });
    expect(result.passed).toBe(true);
    expect(result.steps.map((step) => step.outcome)).toEqual(['passed', 'passed']);
  });

  it('runs the command inside the worktree', async () => {
    const result = await evaluateCompletionGate(policy({ gateCommand: `test -f ${CHECK_PATH}` }), { env: process.env });
    expect(result.passed).toBe(true);
  });

  it('fails on a modified frozen check and skips the command', async () => {
    await writeFile(join(worktree, CHECK_PATH), 'weakened\n');
    const result = await evaluateCompletionGate(policy({ gateCommand: 'exit 0' }), { env: process.env });
    expect(result.passed).toBe(false);
    expect(result.steps).toEqual([
      expect.objectContaining({ name: GATE_STEPS.frozenChecks.name, outcome: 'failed' }),
      expect.objectContaining({ name: GATE_STEPS.verification.name, outcome: 'skipped' }),
    ]);
    expect(renderGateFeedback(result)).toContain(`- ${CHECK_PATH} (modified)`);
  });

  it('fails with the exit code and the tail of the output when the command fails', async () => {
    const command = 'for i in $(seq 1 100); do echo "noise $i"; done; echo "FAIL sum.test.ts expected 3" >&2; exit 4';
    const result = await evaluateCompletionGate(policy({ gateCommand: command }), { env: process.env });
    const feedback = renderGateFeedback(result);
    expect(result.passed).toBe(false);
    expect(feedback).toContain('Verification failed (exit code 4).');
    expect(feedback).toContain('FAIL sum.test.ts expected 3');
    expect(feedback).not.toContain('noise 1\n');
    expect(feedback).not.toContain(command);
    expect(feedback).not.toContain(worktree);
  });

  it('fails when the command exceeds its time budget without revealing the budget', async () => {
    const result = await evaluateCompletionGate(policy({ gateCommand: 'echo started; sleep 30', gateTimeoutMs: 2000 }), {
      env: process.env,
    });
    const feedback = renderGateFeedback(result);
    expect(result.passed).toBe(false);
    expect(feedback).toContain('Verification did not finish in time.');
    expect(feedback).toContain('started');
    expect(feedback).not.toContain('2000');
  });

  it('passes on frozen checks alone when no command is configured', async () => {
    const result = await evaluateCompletionGate(policy({ gateCommand: null }), { env: process.env });
    expect(result.passed).toBe(true);
    expect(result.steps[1]?.outcome).toBe('skipped');
  });

  it('passes the given environment to the command', async () => {
    const result = await evaluateCompletionGate(policy({ gateCommand: 'test -z "$GH_TOKEN"' }), {
      env: { PATH: process.env['PATH'], GH_TOKEN: 'leaked' },
    });
    expect(result.passed).toBe(false);
  });
});
