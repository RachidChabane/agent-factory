import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentRunEvent, AgentRunRequest } from '@agent-factory/application';
import { parseGateDecisionLog, sha256Hex } from '@agent-factory/plugin';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ClaudeCodeHarness } from './claude-code-harness.ts';
import { claudeHarnessConfig } from './claude-harness-config.ts';
import { RUN_FILE_NAMES } from './run-workspace.ts';

const REAL_CLAUDE_ENABLED = process.env['AGENT_FACTORY_REAL_CLAUDE'] === '1';
const FACTORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CREDENTIAL_SENTINEL = ['gh', 'p_factorySentinelMustNeverReachTheAgent'].join('');
const FROZEN_CHECK_PATH = 'checks/acceptance.txt';
const FROZEN_CHECK_CONTENT = 'done.txt contains the word ok\n';
const PRINTENV_COMMAND = 'printenv GH_TOKEN';
const RUN_TIMEOUT_MS = 4 * 60 * 1_000;
const TEST_TIMEOUT_MS = RUN_TIMEOUT_MS + 60 * 1_000;
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const USER_LEVEL_ONLY_HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'SubagentStart',
  'SubagentStop',
  'SessionEnd',
];

const BashInputSchema = z.object({ command: z.string() });

function gateCommand(stateDirectory: string): string {
  const counter = join(stateDirectory, 'gate-runs');
  return [
    `test -z "$GH_TOKEN" || { echo "credential present in the run environment"; exit 1; }`,
    `runs=$(( $(cat '${counter}' 2>/dev/null || echo 0) + 1 ))`,
    `echo "$runs" > '${counter}'`,
    `if [ "$runs" -le 1 ]; then echo "FAIL acceptance: done.txt must contain the word ok"; exit 1; fi`,
    `grep -q ok done.txt`,
  ].join('\n');
}

describe.skipIf(!REAL_CLAUDE_ENABLED)('ClaudeCodeHarness against the real claude binary', () => {
  let root: string;
  let worktree: string;
  let runRequest: AgentRunRequest;
  const events: AgentRunEvent[] = [];

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'claude-real-')));
    worktree = join(root, 'worktree');
    await mkdir(join(worktree, 'checks'), { recursive: true });
    await mkdir(join(root, 'gate-state'));
    await writeFile(join(worktree, FROZEN_CHECK_PATH), FROZEN_CHECK_CONTENT);
    execFileSync('git', ['init', '--quiet'], { cwd: worktree });
    runRequest = {
      runId: 'real-run',
      context: { subject: { kind: 'issue', id: '1' }, attempt: 0, branch: null },
      account: null,
      role: 'implementer',
      model: 'haiku',
      effort: 'low',
      workingDirectory: worktree,
      prompt: [
        'Create a file named done.txt in the current directory containing the single word ok.',
        `Then run this exact command with the Bash tool, on its own: ${PRINTENV_COMMAND}`,
        'Report what it printed (it may print nothing), then finish.',
      ].join('\n'),
      appendSystemPrompt: 'Keep answers short.',
      allowedTools: [`Bash(${PRINTENV_COMMAND})`],
      mcpServers: {},
      resumeSessionId: null,
      maxBudgetUsd: 0.5,
      maxTurns: 20,
      frozenChecks: [{ path: FROZEN_CHECK_PATH, sha256: sha256Hex(FROZEN_CHECK_CONTENT) }],
      gateCommand: gateCommand(join(root, 'gate-state')),
      decisionRequestPath: null,
      timeoutMs: RUN_TIMEOUT_MS,
    };
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it(
    'blocks the stop once, then ends successfully with no user hook and no credential',
    async () => {
      const harness = new ClaudeCodeHarness(
        claudeHarnessConfig({
          runsDirectory: join(root, 'runs'),
          factoryInstallDirectory: FACTORY_ROOT,
          sourceEnvironment: { ...process.env, GH_TOKEN: CREDENTIAL_SENTINEL, GITHUB_TOKEN: CREDENTIAL_SENTINEL },
        }),
      );
      const result = await harness.run(runRequest, (event) => events.push(event), new AbortController().signal);
      const runDirectory = join(root, 'runs', runRequest.runId);
      const decisions = parseGateDecisionLog(await readFile(join(runDirectory, RUN_FILE_NAMES.gateDecisions), 'utf8'));
      const hooks = events.flatMap((event) => (event.kind === 'hook' ? [event] : []));
      const toolCalls = events.flatMap((event) => (event.kind === 'tool-call' ? [event] : []));
      const toolResults = events.flatMap((event) => (event.kind === 'tool-result' ? [event] : []));
      const printenvCall = toolCalls.find(
        (call) => call.toolName === 'Bash' && BashInputSchema.safeParse(call.input).data?.command.trim() === PRINTENV_COMMAND,
      );
      const stopHooks = hooks.filter((hook) => hook.hookEvent === 'Stop');

      console.info(
        JSON.stringify({
          outcome: result.outcome,
          costUsd: result.costUsd,
          turns: result.turns,
          durationMs: result.durationMs,
          gateDecisions: decisions.map((decision) => decision.passed),
          hookEvents: hooks.map((hook) => `${hook.hookEvent}:${String(hook.exitCode)}`),
          tools: toolCalls.map((call) => call.toolName),
        }),
      );

      expect(result.outcome).toBe('success');
      expect(decisions.map((decision) => decision.passed)).toEqual([false, true]);
      expect(stopHooks).toHaveLength(2);
      expect(stopHooks[0]?.output).toContain('"decision":"block"');
      expect(stopHooks[0]?.output).toContain('FAIL acceptance');
      expect(stopHooks[1]?.output).not.toContain('"decision":"block"');

      expect(hooks.filter((hook) => USER_LEVEL_ONLY_HOOK_EVENTS.includes(hook.hookEvent))).toEqual([]);
      const writeCalls = toolCalls.filter((call) => WRITE_TOOLS.has(call.toolName));
      expect(hooks.filter((hook) => hook.hookEvent === 'PreToolUse')).toHaveLength(writeCalls.length);

      expect(printenvCall).toBeDefined();
      const printenvResult = toolResults.find((toolResult) => toolResult.toolUseId === printenvCall?.toolUseId);
      expect(printenvResult).toBeDefined();
      expect(printenvResult?.content).not.toContain(CREDENTIAL_SENTINEL);
      expect(await readFile(result.rawLogPath, 'utf8')).not.toContain(CREDENTIAL_SENTINEL);

      expect(await readFile(join(worktree, 'done.txt'), 'utf8')).toContain('ok');
      expect(await readFile(join(worktree, FROZEN_CHECK_PATH), 'utf8')).toBe(FROZEN_CHECK_CONTENT);
    },
    TEST_TIMEOUT_MS,
  );
});
