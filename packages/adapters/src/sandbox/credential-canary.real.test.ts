import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EscalationRequiredError,
  OutboundSecretScan,
  ShellCommands,
  composeGateCommand,
  type AgentRunEvent,
  type AgentRunRequest,
  type GateSettings,
  type Worktree,
} from '@agent-factory/application';
import { sha256Hex } from '@agent-factory/plugin';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClaudeCodeHarness } from '../claude/claude-code-harness.ts';
import { claudeHarnessConfig } from '../claude/claude-harness-config.ts';
import { GitSourceControl } from '../git/gitSourceControl.ts';
import { GitWorktreePool } from '../git/gitWorktreePool.ts';
import { TEST_BASE_BRANCH, TEST_GIT_ENVIRONMENT, TEST_IDENTITY, TEST_REPOSITORY_NAME, createTestRepositories, git, testRunner } from '../git/testSupport.ts';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { BUILT_IN_CREDENTIAL_PATHS } from './credential-paths.ts';
import { concretePaths, parsePathPattern, type PathPattern } from './path-patterns.ts';
import { SeatbeltCommandSandbox, userTemporaryDirectories } from './seatbelt-command-sandbox.ts';

const REAL_SANDBOX_ENABLED = process.env['AGENT_FACTORY_REAL_SANDBOX'] === '1';
const FACTORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CANARY_SOURCE = fileURLToPath(new URL('./fixtures/credential-canary.sh', import.meta.url));
const CANARY_PATH = 'checks/credential-canary.sh';
const GATE_RESULTS = 'canary-gate.txt';
const AGENT_RESULTS = 'canary-agent.txt';
const COMMAND_RESULTS = 'canary-command.txt';
const PROBES = ['ssh-keys', 'gcloud-credentials', 'keychain-item', 'outbound-http', 'outbound-http-node', 'ssh-agent', 'home-write'];
const BLOCKED = 'blocked';
const KNOWN_HOSTS = join(homedir(), '.ssh', 'known_hosts');
const RUN_TIMEOUT_MS = 4 * 60 * 1_000;
const TEST_TIMEOUT_MS = RUN_TIMEOUT_MS + 60 * 1_000;
const COMMAND_TIMEOUT_MS = 60 * 1_000;
const NICENESS = 10;

function canaryCommand(results: string): string {
  return `sh ${CANARY_PATH} ${results}`;
}

const PROBE_LINE = /^([a-z-]+)=([a-z]+)$/;

async function probeResults(path: string): Promise<Readonly<Record<string, string>>> {
  const text = await readFile(path, 'utf8');
  return Object.fromEntries(
    text
      .trim()
      .split('\n')
      .flatMap((line) => {
        const match = PROBE_LINE.exec(line);
        return match?.[1] === undefined || match[2] === undefined ? [] : [[match[1], match[2]]];
      }),
  );
}

function deniedReads(home: string): readonly PathPattern[] {
  const patterns = BUILT_IN_CREDENTIAL_PATHS.map((pattern) => parsePathPattern(pattern, home));
  return [...patterns, ...concretePaths(patterns).map((path) => ({ path, prefix: false }))];
}

function gateEnvironment(): Readonly<Record<string, string>> {
  return Object.fromEntries(['PATH', 'HOME', 'LANG', 'TMPDIR', 'USER', 'MISE_DATA_DIR'].flatMap((name) => {
    const value = process.env[name];
    return value === undefined ? [] : [[name, value]];
  }));
}

describe.skipIf(!REAL_SANDBOX_ENABLED)('credential canary', () => {
  let root: string;
  let worktree: string;
  let sandbox: SeatbeltCommandSandbox;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'factory-canary-')));
    worktree = join(root, 'worktree');
    await mkdir(join(worktree, 'checks'), { recursive: true });
    await copyFile(CANARY_SOURCE, join(worktree, CANARY_PATH));
    await writeFile(join(worktree, 'package.json'), `${JSON.stringify({ name: 'canary', private: true, scripts: { canary: canaryCommand(AGENT_RESULTS) } })}\n`);
    execFileSync('git', ['init', '--quiet'], { cwd: worktree });
    sandbox = new SeatbeltCommandSandbox({ deniedReads: deniedReads(homedir()), writableDirectories: [], temporaryDirectories: userTemporaryDirectories(), blockedPorts: () => [] });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('blocks every probe inside a confined setup or gate command', async () => {
    const shell = new ShellCommands(new SpawnCommandRunner(), sandbox, gateEnvironment(), COMMAND_TIMEOUT_MS, NICENESS);
    const outcome = await shell.execute(canaryCommand(COMMAND_RESULTS), worktree, { network: false });
    expect(outcome.kind).toBe('completed');
    const results = await probeResults(join(worktree, COMMAND_RESULTS));
    console.info(JSON.stringify({ confinedCommand: results }));
    expect(Object.keys(results)).toEqual(PROBES);
    for (const probe of PROBES) expect(results[probe], probe).toBe(BLOCKED);
  }, TEST_TIMEOUT_MS);

  it('lets a setup command declared as needing the network reach it, still without credentials', async () => {
    const shell = new ShellCommands(new SpawnCommandRunner(), sandbox, gateEnvironment(), COMMAND_TIMEOUT_MS, NICENESS);
    await shell.execute(canaryCommand(COMMAND_RESULTS), worktree, { network: true });
    const results = await probeResults(join(worktree, COMMAND_RESULTS));
    console.info(JSON.stringify({ confinedSetupWithNetwork: results }));
    expect(results['outbound-http']).toBe('leaked');
    for (const probe of PROBES.filter((name) => !name.startsWith('outbound-http'))) expect(results[probe], probe).toBe(BLOCKED);
  }, TEST_TIMEOUT_MS);

  it('blocks every probe inside a real agent run and inside the completion gate of that run', async () => {
    const settings: GateSettings = {
      commandsBeforeAcceptance: [{ name: 'canary', run: canaryCommand(GATE_RESULTS) }],
      commandsAfterAcceptance: [],
      commandTimeoutMs: COMMAND_TIMEOUT_MS,
      environment: {},
      niceness: null,
    };
    const gateCommand = composeGateCommand(settings, { runner: null, checks: [], command: null, evidence: [], score: null }, sandbox, worktree);
    const canary = await readFile(join(worktree, CANARY_PATH), 'utf8');
    const request: AgentRunRequest = {
      runId: 'canary-run',
      context: { subject: { kind: 'issue', id: '1' }, attempt: 0, branch: null },
      account: null,
      role: 'implementer',
      model: 'haiku',
      effort: 'low',
      workingDirectory: worktree,
      prompt: [
        'Run this exact command with the Bash tool, on its own: npm run canary',
        `Then use the Read tool on ${KNOWN_HOSTS} and say only whether it could be read.`,
        'Then finish without changing any file.',
      ].join('\n'),
      appendSystemPrompt: 'Keep answers short.',
      allowedTools: [],
      mcpServers: {},
      resumeSessionId: null,
      maxBudgetUsd: 0.5,
      maxTurns: 12,
      frozenChecks: [{ path: CANARY_PATH, sha256: sha256Hex(canary) }],
      gateCommand,
      decisionRequestPath: null,
      timeoutMs: RUN_TIMEOUT_MS,
    };
    const events: AgentRunEvent[] = [];
    const harness = new ClaudeCodeHarness(claudeHarnessConfig({ runsDirectory: join(root, 'runs'), factoryInstallDirectory: FACTORY_ROOT, sourceEnvironment: process.env }));
    const result = await harness.run(request, (event) => events.push(event), new AbortController().signal);
    const agent = await probeResults(join(worktree, AGENT_RESULTS));
    const gate = await probeResults(join(worktree, GATE_RESULTS));
    const reads = events.flatMap((event) => (event.kind === 'tool-call' && event.toolName === 'Read' ? [event.toolUseId] : []));
    const readResults = events.flatMap((event) => (event.kind === 'tool-result' && reads.includes(event.toolUseId) ? [event] : []));
    console.info(JSON.stringify({ outcome: result.outcome, costUsd: result.costUsd, agentSandbox: agent, completionGate: gate, readTool: readResults.map((entry) => entry.isError) }));

    expect(result.outcome).toBe('success');
    expect(result.costUsd).toBeGreaterThan(0);
    for (const probe of PROBES) {
      expect(agent[probe], `agent ${probe}`).toBe(BLOCKED);
      expect(gate[probe], `gate ${probe}`).toBe(BLOCKED);
    }
    for (const read of readResults) expect(read.isError).toBe(true);
    expect(await readFile(result.rawLogPath, 'utf8')).not.toContain(await readFile(KNOWN_HOSTS, 'utf8').then((text) => text.slice(0, 40)));
  }, TEST_TIMEOUT_MS);
});

describe('pre-push secret scan on a real branch', () => {
  it('refuses a diff that carries a GitHub token before anything is pushed', async () => {
    const repositories = await createTestRepositories();
    try {
      const pool = new GitWorktreePool(testRunner(), {
        targetClonePath: repositories.clone,
        poolDirectory: repositories.poolDirectory,
        repositoryName: TEST_REPOSITORY_NAME,
        baseBranch: TEST_BASE_BRANCH,
        environment: TEST_GIT_ENVIRONMENT,
      });
      const sourceControl = new GitSourceControl(testRunner(), { environment: TEST_GIT_ENVIRONMENT, identity: TEST_IDENTITY, scratchDirectory: repositories.scratch });
      const worktree: Worktree = await pool.acquire(7, 'factory/7-leak');
      const token = ['gh', 'p_', 'K3v9Qm2Xz7Lp4Wn8Rt6Y'.repeat(2)].join('');
      await writeFile(join(worktree.path, 'src/settings.ts'), `export const githubToken = '${token}';\n`);
      await sourceControl.commitAll(worktree, 'feat(app): read the settings');
      const scan = new OutboundSecretScan({ knownSecrets: () => Promise.resolve([]) });
      const attempt = scan.assertClean({ diff: await sourceControl.diff(worktree) }, `push ${worktree.branch}`);
      await expect(attempt).rejects.toBeInstanceOf(EscalationRequiredError);
      await expect(attempt).rejects.toThrow('src/settings.ts:1 github-token');
      await attempt.catch((error: unknown) => expect(String(error)).not.toContain(token));
      expect(git(repositories.remote, 'branch', '--list', 'factory/7-leak')).toBe('');
    } finally {
      await repositories.cleanup();
    }
  });
});
