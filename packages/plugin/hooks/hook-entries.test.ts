import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/gate/frozen-checks.ts';
import { parseGateDecisionLog } from '../src/gate/gate-decision.ts';
import type { GatePolicy } from '../src/gate/gate-policy.ts';
import { HOOK_SCRIPTS } from '../src/hook-scripts.ts';

const FROZEN_PATH = 'checks/sum.test.ts';
const DECISION_REQUEST_PATH = '.factory/human-decision.md';
const FROZEN_CONTENT = 'frozen\n';
const STOP_PAYLOAD = {
  session_id: 'session-1',
  prompt_id: 'prompt-1',
  hook_event_name: 'Stop',
  stop_hook_active: false,
  permission_mode: 'dontAsk',
  effort: { level: 'low' },
  background_tasks: [],
  session_crons: [],
};

interface HookProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runHook(script: string, args: readonly string[], input: string): Promise<HookProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.stdin.end(input);
  });
}

describe('hook entry points', () => {
  let root: string;
  let worktree: string;
  let runDirectory: string;
  let policyPath: string;
  let decisionLogPath: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'hook-entries-')));
    worktree = join(root, 'worktree');
    runDirectory = join(root, 'run');
    await mkdir(join(worktree, 'checks'), { recursive: true });
    await mkdir(runDirectory);
    await writeFile(join(worktree, FROZEN_PATH), FROZEN_CONTENT);
    policyPath = join(runDirectory, 'gate-policy.json');
    decisionLogPath = join(runDirectory, 'gate-decisions.jsonl');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writePolicy(gateCommand: string | null): Promise<void> {
    const policy: GatePolicy = {
      worktree,
      frozenChecks: [{ path: FROZEN_PATH, sha256: sha256Hex(FROZEN_CONTENT) }],
      gateCommand,
      gateTimeoutMs: 10_000,
      decisionLogPath,
      decisionRequestFile: join(worktree, DECISION_REQUEST_PATH),
    };
    await writeFile(policyPath, JSON.stringify(policy));
  }

  describe('stop gate', () => {
    it('lets the session stop and records a passing decision', async () => {
      await writePolicy('exit 0');
      const result = await runHook(HOOK_SCRIPTS.stopGate, ['--policy', policyPath], JSON.stringify(STOP_PAYLOAD));
      expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
      const decisions = parseGateDecisionLog(await readFile(decisionLogPath, 'utf8'));
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toMatchObject({ passed: true, failure: null, sessionId: 'session-1', stopHookActive: false });
    });

    it('blocks the stop with only the failing output, even when the stop hook is already active', async () => {
      await writePolicy('echo "1 failed: sum adds"; exit 1');
      const payload = { ...STOP_PAYLOAD, stop_hook_active: true };
      const result = await runHook(HOOK_SCRIPTS.stopGate, ['--policy', policyPath], JSON.stringify(payload));
      expect(result.exitCode).toBe(0);
      const output: unknown = JSON.parse(result.stdout);
      expect(output).toMatchObject({ decision: 'block' });
      expect(result.stdout).toContain('1 failed: sum adds');
      expect(result.stdout).not.toContain(runDirectory);
      expect(result.stdout).not.toContain('exit 1"');
      const decisions = parseGateDecisionLog(await readFile(decisionLogPath, 'utf8'));
      expect(decisions[0]).toMatchObject({ passed: false, failure: 'gate-failed', stopHookActive: true });
    });

    it('lets the session stop without evaluating the gate when the agent wrote a decision request', async () => {
      await writePolicy('echo "1 failed: sum adds"; exit 1');
      await mkdir(join(worktree, '.factory'));
      await writeFile(join(worktree, DECISION_REQUEST_PATH), 'Composition is not enough: may I write a custom refresh handler?\n');
      const result = await runHook(HOOK_SCRIPTS.stopGate, ['--policy', policyPath], JSON.stringify(STOP_PAYLOAD));
      expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
      const decisions = parseGateDecisionLog(await readFile(decisionLogPath, 'utf8'));
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toMatchObject({ passed: false, failure: 'decision-requested', sessionId: 'session-1' });
    });

    it('still blocks the stop when the decision request is blank', async () => {
      await writePolicy('exit 1');
      await mkdir(join(worktree, '.factory'));
      await writeFile(join(worktree, DECISION_REQUEST_PATH), '\n');
      const result = await runHook(HOOK_SCRIPTS.stopGate, ['--policy', policyPath], JSON.stringify(STOP_PAYLOAD));
      expect(JSON.parse(result.stdout)).toMatchObject({ decision: 'block' });
    });

    it('blocks the stop when a frozen check was modified', async () => {
      await writePolicy('exit 0');
      await writeFile(join(worktree, FROZEN_PATH), 'weakened\n');
      const result = await runHook(HOOK_SCRIPTS.stopGate, ['--policy', policyPath], JSON.stringify(STOP_PAYLOAD));
      expect(result.stdout).toContain(`- ${FROZEN_PATH} (modified)`);
    });

    it('fails closed without revealing where its policy lives when the policy is unreadable', async () => {
      const missingPolicy = join(runDirectory, 'absent.json');
      const result = await runHook(HOOK_SCRIPTS.stopGate, ['--policy', missingPolicy], JSON.stringify(STOP_PAYLOAD));
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ decision: 'block' });
      expect(result.stdout).not.toContain(runDirectory);
    });

    it('fails closed and records the reason when the payload is malformed', async () => {
      await writePolicy('exit 0');
      const result = await runHook(HOOK_SCRIPTS.stopGate, ['--policy', policyPath], '{not json');
      expect(JSON.parse(result.stdout)).toMatchObject({ decision: 'block' });
    });
  });

  describe('frozen write guard', () => {
    function preToolUse(filePath: string): string {
      return JSON.stringify({
        session_id: 'session-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' },
        cwd: worktree,
      });
    }

    it('denies an edit of a frozen check', async () => {
      await writePolicy(null);
      const result = await runHook(HOOK_SCRIPTS.frozenWriteGuard, ['--policy', policyPath], preToolUse(join(worktree, FROZEN_PATH)));
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `${FROZEN_PATH} is a frozen acceptance check and cannot be modified.`,
        },
      });
    });

    it('stays silent for other files so normal permissions apply', async () => {
      await writePolicy(null);
      const result = await runHook(HOOK_SCRIPTS.frozenWriteGuard, ['--policy', policyPath], preToolUse(join(worktree, 'src.ts')));
      expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    });

    it('denies when it cannot read its policy', async () => {
      const result = await runHook(
        HOOK_SCRIPTS.frozenWriteGuard,
        ['--policy', join(runDirectory, 'absent.json')],
        preToolUse(join(worktree, 'src.ts')),
      );
      expect(JSON.parse(result.stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
    });
  });
});
