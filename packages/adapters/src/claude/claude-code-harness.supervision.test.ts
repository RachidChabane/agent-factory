import { mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentRunEvent, AgentRunRequest } from '@agent-factory/application';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ClaudeCodeHarness } from './claude-code-harness.ts';
import { claudeHarnessConfig, type ClaudeHarnessSettings } from './claude-harness-config.ts';
import type { ReferenceMount, ReferenceMounts } from './reference-access.ts';
import { CLAUDE_PRINT_MODE_INVOCATION } from './claude-invocation.ts';
import {
  FAKE_CLAUDE_SCRIPT,
  FAKE_FAILURE_MESSAGE,
  FAKE_FIXTURE_FLAG,
  FAKE_FLOOD_LINE_COUNT,
  FAKE_GRANDCHILD_TYPE,
  FAKE_INVOCATION_TYPE,
  FAKE_MODE_FLAG,
  FAKE_SESSION_ID,
  type FakeMode,
} from './test-fixtures/fake-claude-protocol.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/stream-2.1.296-stop-hook-blocks.jsonl', import.meta.url));
const GRACE_MS = 200;
const PATIENT_GRACE_MS = 2_000;
const SHORT_TIMEOUT_MS = 1_500;
const GENEROUS_TIMEOUT_MS = 30_000;
const PROCESS_GONE_DEADLINE_MS = 3_000;
const POLL_INTERVAL_MS = 50;
const PROMPT = '- implement the sum function';

const InvocationSchema = z.object({
  type: z.literal(FAKE_INVOCATION_TYPE),
  argv: z.array(z.string()),
  prompt: z.string(),
  env: z.record(z.string(), z.string()),
  cwd: z.string(),
});

const GrandchildSchema = z.object({ type: z.literal(FAKE_GRANDCHILD_TYPE), pid: z.number().int() });

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilGone(pid: number): Promise<boolean> {
  const deadline = Date.now() + PROCESS_GONE_DEADLINE_MS;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return !isAlive(pid);
}

function rawLinesOf(events: readonly AgentRunEvent[]): readonly string[] {
  return events.flatMap((event) => (event.kind === 'raw' ? [event.line] : []));
}

describe('ClaudeCodeHarness supervision with a fake claude', () => {
  let root: string;
  let worktree: string;
  let runsDirectory: string;
  let runCounter = 0;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'claude-harness-')));
    worktree = join(root, 'worktree');
    runsDirectory = join(root, 'runs');
    await mkdir(worktree);
    await mkdir(join(root, 'factory'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function harness(mode: FakeMode, overrides: Partial<ClaudeHarnessSettings> = {}): ClaudeCodeHarness {
    return new ClaudeCodeHarness(
      claudeHarnessConfig({
        runsDirectory,
        factoryInstallDirectory: join(root, 'factory'),
        command: [process.execPath, FAKE_CLAUDE_SCRIPT, FAKE_MODE_FLAG, mode, FAKE_FIXTURE_FLAG, FIXTURE],
        niceness: null,
        terminationGraceMs: GRACE_MS,
        sourceEnvironment: { ...process.env, GH_TOKEN: 'ghp_sentinel', SSH_AUTH_SOCK: '/tmp/agent.sock' },
        ...overrides,
      }),
    );
  }

  function request(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
    runCounter += 1;
    return {
      runId: `run-${String(runCounter)}`,
      context: { subject: { kind: 'issue', id: '7' }, attempt: 0, branch: null },
      account: null,
      role: 'implementer',
      model: 'haiku',
      effort: 'low',
      workingDirectory: worktree,
      prompt: PROMPT,
      appendSystemPrompt: 'Follow the repository rules.',
      allowedTools: [],
      mcpServers: {},
      resumeSessionId: null,
      maxBudgetUsd: 1,
      maxTurns: 10,
      frozenChecks: [],
      gateCommand: null,
      decisionRequestPath: null,
      timeoutMs: GENEROUS_TIMEOUT_MS,
      ...overrides,
    };
  }

  it('streams a recorded run into typed events and extracts its result', async () => {
    const events: AgentRunEvent[] = [];
    const runRequest = request();
    const result = await harness('replay').run(runRequest, (event) => events.push(event), new AbortController().signal);
    expect(result).toMatchObject({
      outcome: 'success',
      sessionId: 'fd2f974c-cc7e-42e8-a9ed-eea58626dad3',
      costUsd: 0.00744871,
      durationMs: 17021,
      turns: 7,
      usage: { inputTokens: 20, outputTokens: 2175, cacheReadTokens: 195581, cacheCreationTokens: 22017 },
    });
    expect(result.finalText).toContain('The gate failed on attempt 3.');
    expect(events.filter((event) => event.kind === 'rate-limit')).toHaveLength(1);
    expect(events.filter((event) => event.kind === 'permission-denied')).toHaveLength(1);
    expect(await readFile(result.rawLogPath, 'utf8')).toBe(await readFile(FIXTURE, 'utf8'));
    expect(dirname(result.rawLogPath)).toBe(join(runsDirectory, runRequest.runId));
  });

  it('refuses success when a gated run ends without a passing gate decision', async () => {
    const result = await harness('replay').run(request({ gateCommand: 'npm test' }), () => undefined, new AbortController().signal);
    expect(result.outcome).toBe('error');
  });

  it('launches claude with the print-mode invocation, the prompt on stdin and an isolated environment', async () => {
    const events: AgentRunEvent[] = [];
    const runRequest = request({ resumeSessionId: 'session-7' });
    const runDirectory = join(runsDirectory, runRequest.runId);
    const result = await harness('echo', { niceness: 10 }).run(
      runRequest,
      (event) => events.push(event),
      new AbortController().signal,
    );
    const invocation = rawLinesOf(events)
      .map((line) => InvocationSchema.safeParse(JSON.parse(line)))
      .find((parsed) => parsed.success)?.data;
    expect(result.outcome).toBe('success');
    expect(invocation?.prompt).toBe(PROMPT);
    expect(invocation?.cwd).toBe(worktree);
    expect(invocation?.argv).toEqual(expect.arrayContaining([...CLAUDE_PRINT_MODE_INVOCATION, '--resume', 'session-7']));
    expect(invocation?.argv).not.toContain(PROMPT);
    expect(invocation?.env).not.toHaveProperty('GH_TOKEN');
    expect(invocation?.env).not.toHaveProperty('SSH_AUTH_SOCK');
    expect(invocation?.env['GH_CONFIG_DIR']).toBe(join(runDirectory, 'gh-config'));
    expect(await readdir(join(runDirectory, 'gh-config'))).toEqual([]);
    const argv = invocation?.argv ?? [];
    expect(argv[argv.indexOf('--settings') + 1]).toBe(join(runDirectory, 'settings.json'));
    const appendedPrompt = await readFile(argv[argv.indexOf('--append-system-prompt-file') + 1] ?? '', 'utf8');
    expect(appendedPrompt.startsWith('Follow the repository rules.')).toBe(true);
    expect(appendedPrompt).toContain('- `uv run`');
  });

  describe('reference snapshots', () => {
    const SNAPSHOT_COMMIT = '1d3e4a9ce003af09489551fd6398fc44c24069cc';

    function mount(): ReferenceMount {
      return { name: 'design-tokens', repository: 'example-org/design-tokens', ref: 'v1.0.0', commit: SNAPSHOT_COMMIT, path: join(root, 'references', 'design-tokens@v1.0.0') };
    }

    async function runWith(references: ReferenceMounts, overrides: Partial<AgentRunRequest> = {}) {
      const events: AgentRunEvent[] = [];
      await harness('echo', { references }).run(request(overrides), (event) => events.push(event), new AbortController().signal);
      const invocation = rawLinesOf(events)
        .map((line) => InvocationSchema.safeParse(JSON.parse(line)))
        .find((parsed) => parsed.success)?.data;
      const argv = invocation?.argv ?? [];
      return {
        prompt: await readFile(argv[argv.indexOf('--append-system-prompt-file') + 1] ?? '', 'utf8'),
        settings: JSON.parse(await readFile(argv[argv.indexOf('--settings') + 1] ?? '', 'utf8')) as {
          permissions: { allow: string[]; deny: string[] };
          sandbox: { filesystem: { allowRead: string[]; denyWrite: string[] } };
        },
      };
    }

    it('lists the snapshots in the appended prompt and opens them in the settings of a writing role', async () => {
      const { prompt, settings } = await runWith(() => Promise.resolve([mount()]));

      expect(prompt).toContain('# Reference repositories');
      expect(prompt).toContain(`\`example-org/design-tokens\` at \`v1.0.0\` (commit \`${SNAPSHOT_COMMIT}\`), read from \`${mount().path}\``);
      expect(prompt).toContain(`- \`cp -R ${mount().path}/\``);
      expect(settings.permissions.allow).toContain(`Bash(cp ${mount().path}/*)`);
      expect(settings.permissions.deny).toEqual(expect.arrayContaining([`Edit(/${mount().path}/**)`, `Write(/${mount().path}/**)`]));
      expect(settings.sandbox.filesystem.allowRead).toContain(mount().path);
      expect(settings.sandbox.filesystem.denyWrite).toContain(mount().path);
    });

    it('lets a read-only role read the snapshots, and tells it nothing about copying', async () => {
      const { prompt, settings } = await runWith(() => Promise.resolve([mount()]), { role: 'reviewer' });

      expect(prompt).toContain('# Reference repositories');
      expect(prompt).not.toContain('cp -R');
      expect(settings.permissions.allow.some((rule) => rule.startsWith('Bash'))).toBe(false);
      expect(settings.sandbox.filesystem.allowRead).toContain(mount().path);
    });

    it('says nothing of references when the project has none', async () => {
      const { prompt, settings } = await runWith(() => Promise.resolve([]));

      expect(prompt).not.toContain('Reference repositories');
      expect(settings.permissions.allow.some((rule) => rule.startsWith('Bash(cp'))).toBe(false);
    });

    it('reads the snapshots again for every run', async () => {
      let snapshots: readonly ReferenceMount[] = [];
      const config = harness('echo', { references: () => Promise.resolve(snapshots) });
      const promptOf = async (): Promise<string> => {
        const events: AgentRunEvent[] = [];
        await config.run(request(), (event) => events.push(event), new AbortController().signal);
        const argv = rawLinesOf(events).map((line) => InvocationSchema.safeParse(JSON.parse(line))).find((parsed) => parsed.success)?.data?.argv ?? [];
        return readFile(argv[argv.indexOf('--append-system-prompt-file') + 1] ?? '', 'utf8');
      };

      expect(await promptOf()).not.toContain('Reference repositories');
      snapshots = [mount()];
      expect(await promptOf()).toContain(`(commit \`${SNAPSHOT_COMMIT}\`)`);
    });
  });

  it('runs under the configuration directory of the requested Claude account', async () => {
    const events: AgentRunEvent[] = [];
    const configDirectory = join(root, 'claude-second');
    await harness('echo', { accounts: { second: configDirectory } }).run(
      request({ account: 'second' }),
      (event) => events.push(event),
      new AbortController().signal,
    );
    const invocation = rawLinesOf(events)
      .map((line) => InvocationSchema.safeParse(JSON.parse(line)))
      .find((parsed) => parsed.success)?.data;
    expect(invocation?.env['CLAUDE_CONFIG_DIR']).toBe(configDirectory);
  });

  it('refuses an account that is not configured', async () => {
    await expect(
      harness('echo', { accounts: { second: join(root, 'claude-second') } }).run(
        request({ account: 'third' }),
        () => undefined,
        new AbortController().signal,
      ),
    ).rejects.toThrow('No Claude account named third is configured (known: second)');
  });

  it('reports a crash before any result as an error carrying the stderr tail', async () => {
    const result = await harness('fail').run(request(), () => undefined, new AbortController().signal);
    expect(result.outcome).toBe('error');
    expect(result.finalText).toContain(FAKE_FAILURE_MESSAGE);
    expect(result.sessionId).toBeNull();
  });

  it('interrupts a run that exceeds its timeout', async () => {
    const startedAt = Date.now();
    const result = await harness('hang', { terminationGraceMs: PATIENT_GRACE_MS }).run(
      request({ timeoutMs: SHORT_TIMEOUT_MS }),
      () => undefined,
      new AbortController().signal,
    );
    expect(result.outcome).toBe('timeout');
    expect(result.sessionId).toBe(FAKE_SESSION_ID);
    expect(Date.now() - startedAt).toBeLessThan(SHORT_TIMEOUT_MS + PATIENT_GRACE_MS);
  });

  it('escalates to SIGKILL and leaves no descendant behind when claude ignores interrupts', async () => {
    const events: AgentRunEvent[] = [];
    const result = await harness('stubborn').run(
      request({ timeoutMs: SHORT_TIMEOUT_MS }),
      (event) => events.push(event),
      new AbortController().signal,
    );
    const grandchild = rawLinesOf(events)
      .map((line) => GrandchildSchema.safeParse(JSON.parse(line)))
      .find((parsed) => parsed.success)?.data;
    expect(result.outcome).toBe('timeout');
    expect(grandchild).toBeDefined();
    expect(await waitUntilGone(grandchild?.pid ?? 0)).toBe(true);
  });

  it('stops the run when the caller aborts', async () => {
    const controller = new AbortController();
    const result = await harness('hang').run(
      request(),
      (event) => {
        if (event.kind === 'session-started') {
          controller.abort();
        }
      },
      controller.signal,
    );
    expect(result.outcome).toBe('aborted');
  });

  it('stops at once when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await harness('hang').run(request(), () => undefined, controller.signal);
    expect(result.outcome).toBe('aborted');
  });

  it('stops the run and rejects when the event listener fails', async () => {
    const failure = new Error('listener failed');
    await expect(
      harness('hang').run(
        request(),
        () => {
          throw failure;
        },
        new AbortController().signal,
      ),
    ).rejects.toBe(failure);
  });

  it('keeps memory bounded on long streams by capping oversized lines', async () => {
    let eventCount = 0;
    const truncated: string[] = [];
    const result = await harness('flood', { maxLineBytes: 64 * 1024 }).run(
      request(),
      (event) => {
        eventCount += 1;
        if (event.kind === 'raw' && event.line.length === 64 * 1024) {
          truncated.push(event.line);
        }
      },
      new AbortController().signal,
    );
    expect(result.outcome).toBe('success');
    expect(eventCount).toBe(FAKE_FLOOD_LINE_COUNT + 3);
    expect(truncated).toHaveLength(1);
  });

  it('treats a run whose settings changed during the run as an error', async () => {
    const result = await harness('tamper').run(request(), () => undefined, new AbortController().signal);
    expect(result.outcome).toBe('error');
  });
});
