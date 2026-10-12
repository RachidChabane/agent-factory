import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeWorkspaceFiles, PINNED_CLAUDE_VERSION, SpawnCommandRunner } from '@agent-factory/adapters';
import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { issueSubject } from '@agent-factory/domain';
import { ConfigMissingError, parseFactoryConfig, type FactoryConfig } from '../config/factory-config.ts';
import { openEventLog } from '../composition/event-log.ts';
import { openFactory } from '../composition/factory-container.ts';
import type { CliContext } from './cli-context.ts';
import { DEFAULT_PROJECT_CONVENTIONS, requiredLabels } from '@agent-factory/application';
import { runCli } from './factory-cli.ts';

const CONFIG_TEXT = (home: string): string => `
target: { owner: acme, name: widgets, clonePath: ${home}/clone }
roles:
  acceptance-author: { model: sonnet, effort: medium, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }
  implementer: { model: sonnet, effort: high, maxBudgetUsd: 2, maxTurns: 20, timeoutMinutes: 10, escalation: { model: opus, effort: max } }
  reviewer: { model: sonnet, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }
gate: {}
conventionalCommits: { defaultScope: repo }
github: { commitIdentity: { name: Bot, email: bot@example.invalid } }
`;

const LOCAL_MODE = 'github: { mode: local, commitIdentity:';
const SPEC_FILE = [
  'Title: Serve the domain from the UI',
  'Labels: type:infra',
  '',
  '## Need',
  'The domain reaches the UI.',
  '',
  '## Acceptance criteria',
  '1. The production values declare the route.',
  '',
  '## Out of scope',
  '- DNS records.',
  '',
  '## Expected proof',
  'The check fails on main and passes on the branch.',
  '',
].join('\n');
const REAL_GIT_TEST_TIMEOUT_MS = 30_000;
const ISOLATED_GIT_ENVIRONMENT = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Seed',
  GIT_AUTHOR_EMAIL: 'seed@example.test',
  GIT_COMMITTER_NAME: 'Seed',
  GIT_COMMITTER_EMAIL: 'seed@example.test',
};

function seedSourceClone(path: string): void {
  const run = (...args: string[]): void => {
    execFileSync('git', args, { cwd: path, env: { ...process.env, ...ISOLATED_GIT_ENVIRONMENT }, stdio: 'ignore' });
  };
  run('init', '--initial-branch', 'main');
  run('commit', '--allow-empty', '--message', 'seed');
  run('remote', 'add', 'origin', 'git@github.com:acme/widgets.git');
}

class TableRunner implements CommandRunner {
  readonly results = new Map<string, CommandResult>();
  readonly lastArguments = new Map<string, CommandResult>();
  readonly asked: string[] = [];

  answer(command: string, stdout: string, exitCode = 0): this {
    this.results.set(command, { exitCode, stdout, stderr: '', durationMs: 1, timedOut: false });
    return this;
  }

  answerShell(command: string, stdout: string, exitCode = 0, timedOut = false): this {
    this.lastArguments.set(command, { exitCode, stdout, stderr: '', durationMs: 1, timedOut });
    return this;
  }

  run(command: readonly string[]): Promise<CommandResult> {
    const key = command.join(' ');
    this.asked.push(key);
    const result =
      this.lastArguments.get(command.at(-1) ?? '') ?? this.results.get(key) ?? [...this.results].find(([prefix]) => key.startsWith(prefix))?.[1];
    return result === undefined ? Promise.reject(new Error(`unexpected ${key}`)) : Promise.resolve(result);
  }
}

interface Captured {
  readonly lines: string[];
  readonly errors: string[];
}

function healthyRunner(home: string): TableRunner {
  return new TableRunner()
    .answer('git --version', 'git version 2.54.0')
    .answer('gh auth status', 'github.com\n  Logged in')
    .answer('gh label list', JSON.stringify([...requiredLabels(DEFAULT_PROJECT_CONVENTIONS), 'bug'].map((name) => ({ name }))))
    .answer('claude --version', `${PINNED_CLAUDE_VERSION} (Claude Code)`)
    .answer(`git -C ${home}/clone remote get-url origin`, 'git@github.com:acme/widgets.git')
    .answer('memory_pressure -Q', 'System-wide memory free percentage: 61%')
    .answer('sysctl -n kern.memorystatus_vm_pressure_level', '1')
    .answer('/usr/bin/sandbox-exec -p', '')
    .answer('gh --version', 'gh version 2.93.0 (2026-05-27)');
}

describe('factory CLI', () => {
  let home: string;
  let config: FactoryConfig;
  let captured: Captured;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'factory-cli-'));
    config = parseFactoryConfig(CONFIG_TEXT(home), home, join(home, 'config.yaml'));
    captured = { lines: [], errors: [] };
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  function context(overrides: Partial<CliContext> = {}): CliContext {
    return {
      environment: {},
      output: { line: (text) => captured.lines.push(text), error: (text) => captured.errors.push(text) },
      runner: healthyRunner(home),
      files: new NodeWorkspaceFiles(),
      clock: { now: () => new Date('2026-10-10T08:00:00.000Z') },
      loadConfig: () => Promise.resolve(config),
      openFactory: () => Promise.reject(new Error('not used')),
      openEventLog,
      ...overrides,
    };
  }

  it('prints the usage on a malformed command line', async () => {
    expect(await runCli(['run-issue', 'abc'], context())).toBe(2);
    expect(captured.errors[0]).toContain('issue number must be a positive integer');
    expect(captured.errors[0]).toContain('Usage: factory <command>');
  });

  it('reports an issue unknown to the factory', async () => {
    expect(await runCli(['status', '9'], context())).toBe(1);
    expect(captured.errors).toEqual(['Issue #9 is unknown to the factory']);
  });

  it('projects the status of an issue from the event log', async () => {
    const eventLog = openEventLog(config);
    await eventLog.states.transition(42, 'spec-draft', 'taken');
    await eventLog.states.transition(42, 'spec-validated', 'validated');
    await eventLog.states.transition(42, 'needs-human', 'the before proof is not valid: checks do not fail on base');
    await eventLog.events.append('pipeline.worktree-acquired', issueSubject(42), { path: '/pool/slot-0', branch: 'factory/42-x', baseSha: 'abc' });
    eventLog.close();

    expect(await runCli(['status', '42'], context())).toBe(0);
    expect(captured.lines).toEqual([
      'Issue #42',
      'State: needs-human',
      'Needs human: the before proof is not valid: checks do not fail on base',
      'Branch: none',
      'Worktree: /pool/slot-0',
      'Before proof: none',
      'Frozen checks: none',
      'Implementer attempts: 0 (0 resumed, 0 escalated)',
      'Last gate: none',
      'Last review: none',
      'Pull request: none',
      'Agent cost: $0.00',
    ]);
  });

  it('validates the configuration and every tool', async () => {
    expect(await runCli(['validate'], context())).toBe(0);
    expect(captured.lines.map((line) => line.split(':')[0])).toEqual([
      'ok   configuration',
      'ok   git',
      'ok   gh auth',
      'ok   claude',
      'ok   target clone',
      'ok   labels',
      'ok   role prompts',
      'ok   claude accounts',
      'ok   notifications',
      'ok   resources',
      'ok   command sandbox',
    ]);
  });

  it('runs each setup and gate command on a clean base workspace and fails on an undeclared network need', async () => {
    const gated = parseFactoryConfig(
      CONFIG_TEXT(home)
        .replace(`clonePath: ${home}/clone }`, `clonePath: ${home}/clone, setupCommands: [{ name: install, run: npm ci, network: registry }] }`)
        .replace('gate: {}', 'gate: { commandsBeforeAcceptance: [{ name: lint, run: mise run lint }, { name: lint-helm, run: mise run lint:helm }] }'),
      home,
      join(home, 'config.yaml'),
    );
    const runner = healthyRunner(home)
      .answer('git', '')
      .answerShell('npm ci', 'added 412 packages')
      .answerShell('mise tasks info lint', 'Task lint')
      .answerShell('mise run lint', 'All files pass')
      .answerShell('mise tasks info lint:helm', 'Task lint:helm')
      .answerShell('mise run lint:helm', 'dial tcp: lookup raw.githubusercontent.com: no such host', 1);
    expect(await runCli(['validate'], context({ runner, loadConfig: () => Promise.resolve(gated) }))).toBe(1);
    expect(captured.lines.filter((line) => line.includes('gate preflight'))).toEqual([
      'ok   gate preflight setup install: passed: passed on the clean base in 0 s',
      'ok   gate preflight before-acceptance lint: passed: passed on the clean base in 0 s',
      'FAIL gate preflight before-acceptance lint-helm: network-undeclared: needs the network but declares none (dial tcp: lookup raw.githubusercontent.com: no such host); add "network: <reason>" to lint-helm',
    ]);
    expect(runner.asked.some((command) => command.includes(`worktree add --detach ${home}/worktrees/base-workspaces/gate-preflight`))).toBe(true);
    expect(runner.asked.filter((command) => command.endsWith('mise run lint:helm')).every((command) => command.includes('/usr/bin/sandbox-exec'))).toBe(true);
  });

  it('skips the gate preflight on request', async () => {
    const gated = parseFactoryConfig(CONFIG_TEXT(home).replace('gate: {}', 'gate: { commandsBeforeAcceptance: [{ name: lint, run: mise run lint }] }'), home, join(home, 'config.yaml'));
    expect(await runCli(['validate', '--skip-gate-preflight'], context({ loadConfig: () => Promise.resolve(gated) }))).toBe(0);
    expect(captured.lines.some((line) => line.includes('gate preflight'))).toBe(false);
  });

  it('fails validation on an unpinned claude, a foreign clone and short memory', async () => {
    const runner = healthyRunner(home)
      .answer('claude --version', '9.9.9 (Claude Code)')
      .answer(`git -C ${home}/clone remote get-url origin`, 'git@github.com:other/repo.git')
      .answer('memory_pressure -Q', 'System-wide memory free percentage: 12%');
    expect(await runCli(['validate'], context({ runner }))).toBe(1);
    expect(captured.lines.filter((line) => line.startsWith('FAIL')).map((line) => line.split(':')[0])).toEqual([
      'FAIL claude',
      'FAIL target clone',
      'FAIL resources',
    ]);
  });

  it('shows the issue it would create on GitHub and creates nothing without --confirm', async () => {
    await writeFile(join(home, 'spec.md'), SPEC_FILE);
    expect(await runCli(['issue', 'create', join(home, 'spec.md')], context())).toBe(5);
    expect(captured.lines.slice(0, 3)).toEqual([
      'This creates an issue on GitHub in acme/widgets:',
      'Title: Serve the domain from the UI',
      'Labels: type:infra',
    ]);
    expect(captured.errors).toEqual(['Nothing was created. Re-run with --confirm to create it.']);
  });

  it('refuses a spec file that already carries spec:validated', async () => {
    await writeFile(join(home, 'spec.md'), SPEC_FILE.replace('Labels: type:infra', 'Labels: type:infra, spec:validated'));
    expect(await runCli(['issue', 'create', join(home, 'spec.md'), '--confirm'], context())).toBe(1);
    expect(captured.errors[0]).toContain('only the operator adds that label');
  });

  it('stores a request with its images under the factory home', async () => {
    await mkdir(join(home, 'shots'));
    await writeFile(join(home, 'shots', 'header.png'), 'png');
    await writeFile(join(home, 'ask.md'), '# Link mockups to conversations\nOperators get lost.\n');
    expect(await runCli(['request', 'add', join(home, 'ask.md'), '--images', join(home, 'shots'), '--requester', 'Dana'], context())).toBe(0);
    expect(captured.lines[0]).toBe(`Request req-1 stored with 1 image(s) in ${home}/requests/req-1`);
    expect(await readFile(join(home, 'requests', 'req-1', 'images', 'header.png'), 'utf8')).toBe('png');
    expect(await readFile(join(home, 'requests', 'req-1', 'request.md'), 'utf8')).toContain('Operators get lost.');
  });

  it('refuses to drive an issue while another factory process holds the lock', async () => {
    await mkdir(config.directories.state, { recursive: true });
    await writeFile(join(config.directories.state, 'factory.lock'), `${process.ppid}\n`);
    expect(await runCli(['run-issue', '7'], context())).toBe(1);
    expect(captured.errors[0]).toBe(`Factory process ${process.ppid} is running and holds ${config.directories.state}/factory.lock; wait for it to finish or stop it first`);
  });

  describe('rehearsal', () => {
    let localConfig: FactoryConfig;

    beforeEach(async () => {
      localConfig = parseFactoryConfig(CONFIG_TEXT(home).replace('github: { commitIdentity:', LOCAL_MODE), home, join(home, 'config.yaml'));
      await mkdir(localConfig.target.clonePath, { recursive: true });
      await mkdir(localConfig.github.local.bareRepositoryPath, { recursive: true });
    });

    it('refuses the rehearsal commands unless github.mode is local', async () => {
      expect(await runCli(['rehearsal', 'init', home], context())).toBe(1);
      expect(await runCli(['rehearsal', 'add-issue', join(home, 'spec.md')], context())).toBe(1);
      expect(await runCli(['rehearsal', 'reset', home], context())).toBe(1);
      expect(captured.errors).toHaveLength(3);
      expect(captured.errors.every((error) => error.includes('github.mode: local'))).toBe(true);
    });

    it('validates a clone of the rehearsal remote without asking GitHub', async () => {
      const bare = join(home, 'github', 'widgets.git');
      const runner = healthyRunner(home)
        .answer('gh auth status', 'should not be asked', 1)
        .answer('git remote', 'origin')
        .answer('git remote get-url --all origin', bare)
        .answer('git remote get-url --push --all origin', bare);
      expect(await runCli(['validate'], context({ runner, loadConfig: () => Promise.resolve(localConfig) }))).toBe(0);
      expect(captured.lines).toContain('ok   gh auth: not used: github.mode is local');
      expect(captured.lines).toContain('ok   labels: not used: github.mode is local');
      expect(captured.lines).toContain(`ok   target clone: ${home}/clone (rehearsal remote ${bare})`);
    });

    it('fails validation when a rehearsal remote can reach the network', async () => {
      const bare = join(home, 'github', 'widgets.git');
      const runner = healthyRunner(home)
        .answer('git remote', 'origin')
        .answer('git remote get-url --all origin', bare)
        .answer('git remote get-url --push --all origin', 'git@github.com:acme/widgets.git');
      expect(await runCli(['validate'], context({ runner, loadConfig: () => Promise.resolve(localConfig) }))).toBe(1);
      expect(captured.lines.find((line) => line.startsWith('FAIL target clone'))).toContain('not local paths');
    });

    it('mirrors a source clone and files local issues from spec files', async () => {
      const root = await realpath(home);
      const source = join(root, 'source');
      await mkdir(source);
      seedSourceClone(source);
      await rm(join(root, 'clone'), { recursive: true });
      await rm(join(root, 'github'), { recursive: true });
      const config = parseFactoryConfig(CONFIG_TEXT(root).replace('github: { commitIdentity:', LOCAL_MODE), root, join(root, 'config.yaml'));
      const real = context({
        environment: process.env,
        runner: new SpawnCommandRunner(),
        loadConfig: () => Promise.resolve(config),
        openFactory: (loaded) => openFactory(loaded, process.env),
      });

      expect(await runCli(['rehearsal', 'init', source], real)).toBe(0);
      expect(captured.lines[0]).toBe(`Rehearsal remote (created): ${root}/github/widgets.git`);

      const gitIn = (cwd: string, ...args: string[]): string =>
        execFileSync('git', args, { cwd, env: { ...process.env, ...ISOLATED_GIT_ENVIRONMENT }, encoding: 'utf8' }).trim();
      const sourceBase = gitIn(source, 'rev-parse', 'HEAD');
      gitIn(join(root, 'clone'), 'commit', '--allow-empty', '--quiet', '-m', 'merged rehearsal pull request');
      gitIn(join(root, 'clone'), 'push', '--quiet', 'origin', 'HEAD:main');
      expect(await runCli(['rehearsal', 'reset', source], real)).toBe(0);
      expect(captured.lines.at(-1)).toBe(`Base main of ${root}/github/widgets.git and ${root}/clone reset to ${sourceBase}`);

      await writeFile(join(root, 'spec.md'), SPEC_FILE);
      expect(await runCli(['rehearsal', 'add-issue', join(root, 'spec.md'), '--labels', 'type:infra,spec:validated'], real)).toBe(0);
      expect(captured.lines.at(-1)).toBe('Local issue #1: Serve the domain from the UI [type:infra, spec:validated]');
      expect(await readFile(join(root, 'github', 'issues', '1.md'), 'utf8')).toContain('## Acceptance criteria\n1. The production values declare the route.');

      await writeFile(join(root, 'spec.md'), SPEC_FILE.replace('## Out of scope\n- DNS records.\n', ''));
      expect(await runCli(['rehearsal', 'add-issue', join(root, 'spec.md')], real)).toBe(1);
      expect(captured.errors.at(-1)).toContain('section "## Out of scope" is missing');
    }, REAL_GIT_TEST_TIMEOUT_MS);

    it('abandons an escalated issue, frees its worktree and refuses while the factory runs', async () => {
      const root = await realpath(home);
      const source = join(root, 'source');
      await mkdir(source);
      seedSourceClone(source);
      await rm(join(root, 'clone'), { recursive: true });
      await rm(join(root, 'github'), { recursive: true });
      const config = parseFactoryConfig(CONFIG_TEXT(root).replace('github: { commitIdentity:', LOCAL_MODE), root, join(root, 'config.yaml'));
      const real = context({
        environment: { ...process.env, USER: 'alex' },
        runner: new SpawnCommandRunner(),
        loadConfig: () => Promise.resolve(config),
        openFactory: (loaded) => openFactory(loaded, process.env),
      });
      expect(await runCli(['rehearsal', 'init', source], real)).toBe(0);
      const factory = await openFactory(config, process.env);
      const worktree = await factory.dependencies.pool.acquire(5, 'factory/5-keep-users-signed-in');
      await factory.dependencies.states.transition(5, 'spec-draft', 'taken');
      await factory.dependencies.states.transition(5, 'spec-validated', 'validated');
      await factory.dependencies.events.append('pipeline.worktree-acquired', issueSubject(5), worktree);
      await factory.dependencies.states.transition(5, 'authoring-checks', 'worktree ready');
      await factory.dependencies.states.transition(5, 'needs-human', 'the implementer asked for a decision');
      factory.close();

      await mkdir(config.directories.state, { recursive: true });
      await writeFile(join(config.directories.state, 'factory.lock'), `${process.ppid}\n`);
      expect(await runCli(['issue', 'abandon', '5', '--reason', 'waits on an architecture decision'], real)).toBe(1);
      expect(captured.errors.at(-1)).toContain(`Factory process ${process.ppid} is running`);
      await rm(join(config.directories.state, 'factory.lock'));

      expect(await runCli(['issue', 'abandon', '5', '--reason', 'waits on an architecture decision'], real)).toBe(0);
      expect(captured.lines.slice(-2)).toEqual([
        `Issue #5 abandoned: its worktree ${worktree.path} is free; the factory will not start it again.`,
        `Left as it is: the issue stays open on the local GitHub ${root}/github; branch factory/5-keep-users-signed-in stays in ${root}/clone.`,
      ]);
      expect(JSON.parse(await readFile(join(root, 'worktrees', 'widgets', 'leases.json'), 'utf8'))).toEqual({ leases: [] });
      expect(await runCli(['status', '5'], real)).toBe(0);
      expect(captured.lines).toContain('State: abandoned');
      expect(captured.lines).toContain('Worktree: none');
      expect(await runCli(['issue', 'abandon', '5', '--reason', 'again'], real)).toBe(1);
      expect(captured.errors.at(-1)).toBe('Issue #5 cannot be abandoned: it is abandoned, not needs-human');
    }, REAL_GIT_TEST_TIMEOUT_MS);

    it('refuses to rehearse in a clone that still points at GitHub', async () => {
      const root = await realpath(home);
      const clone = join(root, 'clone');
      seedSourceClone(clone);
      const config = parseFactoryConfig(CONFIG_TEXT(root).replace('github: { commitIdentity:', LOCAL_MODE), root, join(root, 'config.yaml'));
      await expect(openFactory(config, process.env)).rejects.toThrow('not local paths');
    });
  });

  it('fails validation when the target lacks the labels the factory puts on specs and pull requests', async () => {
    const runner = healthyRunner(home).answer('gh label list', JSON.stringify([{ name: 'factory' }, { name: 'bug' }]));
    expect(await runCli(['validate'], context({ runner }))).toBe(1);
    const labels = captured.lines.find((line) => line.startsWith('FAIL labels')) ?? '';
    expect(labels).toContain('acme/widgets lacks the labels spec:validated, audit, type:feature, type:fix, type:ui');
    expect(labels).not.toContain(' factory,');
  });

  it('still checks the tools when the configuration is missing', async () => {
    const missing = new ConfigMissingError(join(home, 'config.yaml'));
    expect(await runCli(['validate'], context({ loadConfig: () => Promise.reject(missing) }))).toBe(1);
    expect(captured.lines[0]).toBe(`FAIL configuration: ${missing.message}`);
    expect(captured.lines).toContain('ok   git: git version 2.54.0');
    expect(captured.lines).toContain('FAIL target clone: skipped: the configuration did not load');
  });
});
