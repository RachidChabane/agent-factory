import { execFileSync } from 'node:child_process';
import { NodeWorkspaceFiles, PINNED_CLAUDE_VERSION } from '@agent-factory/adapters';
import { DEFAULT_PROJECT_CONVENTIONS, requiredLabels, type CommandResult, type CommandRunner } from '@agent-factory/application';
import { parseAgentFactoryConfig, type AgentFactoryConfig } from '../../config/agent-factory-config.ts';
import { openEventLog } from '../../composition/installation/event-log.ts';
import type { CliContext } from '../cli-context.ts';

export const NOW = new Date('2026-10-10T08:00:00.000Z');
export const REAL_GIT_TEST_TIMEOUT_MS = 30_000;
export const ISOLATED_GIT_ENVIRONMENT = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Seed',
  GIT_AUTHOR_EMAIL: 'seed@example.test',
  GIT_COMMITTER_NAME: 'Seed',
  GIT_COMMITTER_EMAIL: 'seed@example.test',
};

export const SPEC_FILE = [
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

const QUICK_ROLE = '{ model: sonnet, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }';

/** One GitHub project, widgets, and optionally a second one on a local forge. */
export function configText(projects: readonly ('widgets' | 'gadgets')[] = ['widgets']): string {
  const entries = projects.map((id) =>
    id === 'widgets'
      ? `  - id: widgets
    name: Widgets
    forge: { kind: github, repository: acme/widgets }
    commitIdentity: { name: Bot, email: bot@example.invalid }
    conventions: { defaultScope: repo }`
      : `  - id: gadgets
    name: Gadgets
    forge: { kind: local, repository: acme/gadgets }
    commitIdentity: { name: Bot, email: bot@example.invalid }
    conventions: { defaultScope: repo }`,
  );
  return `version: 1
defaults:
  roles:
    acceptance-author: ${QUICK_ROLE}
    implementer: { model: sonnet, effort: high, maxBudgetUsd: 2, maxTurns: 20, timeoutMinutes: 10, escalation: { model: opus, effort: max } }
    reviewer: ${QUICK_ROLE}
projects:
${entries.join('\n')}
`;
}

export function parseConfig(text: string, home: string): AgentFactoryConfig {
  return parseAgentFactoryConfig(text, home, `${home}/config.yaml`, home);
}

/** Answers each command by its full text, by a prefix of it, or by its last argument when it is a shell line. */
export class TableRunner implements CommandRunner {
  readonly results = new Map<string, CommandResult>();
  readonly shellLines = new Map<string, CommandResult>();
  readonly asked: string[] = [];

  answer(command: string, stdout: string, exitCode = 0): this {
    this.results.set(command, { exitCode, stdout, stderr: '', durationMs: 1, timedOut: false });
    return this;
  }

  answerShell(line: string, stdout: string, exitCode = 0, timedOut = false): this {
    this.shellLines.set(line, { exitCode, stdout, stderr: '', durationMs: 1, timedOut });
    return this;
  }

  knows(command: readonly string[]): boolean {
    return this.lookup(command) !== undefined;
  }

  run(command: readonly string[]): Promise<CommandResult> {
    const key = command.join(' ');
    this.asked.push(key);
    const result = this.lookup(command);
    return result === undefined ? Promise.reject(new Error(`unexpected ${key}`)) : Promise.resolve(result);
  }

  private lookup(command: readonly string[]): CommandResult | undefined {
    const key = command.join(' ');
    return this.shellLines.get(command.at(-1) ?? '') ?? this.results.get(key) ?? [...this.results].find(([prefix]) => key.startsWith(prefix))?.[1];
  }
}

/** Answers the commands its table knows, such as the probes of the machine's tools, and runs every other command for real. */
export class TableOverRealRunner implements CommandRunner {
  private readonly table: TableRunner;
  private readonly real: CommandRunner;

  constructor(table: TableRunner, real: CommandRunner) {
    this.table = table;
    this.real = real;
  }

  run(command: readonly string[], cwd: string, timeoutMs: number, env: Readonly<Record<string, string>>): Promise<CommandResult> {
    return (this.table.knows(command) ? this.table : this.real).run(command, cwd, timeoutMs, env);
  }
}

/** A machine where every built-in tool answers, the widgets clone points at GitHub and memory is plentiful. */
export function healthyRunner(home: string): TableRunner {
  return new TableRunner()
    .answer('git --version', 'git version 2.54.0')
    .answer('gh auth status', 'github.com\n  Logged in')
    .answer('gh --version', 'gh version 2.93.0 (2026-05-27)')
    .answer('gh label list', JSON.stringify([...requiredLabels(DEFAULT_PROJECT_CONVENTIONS), 'bug'].map((name) => ({ name }))))
    .answer('claude --version', `${PINNED_CLAUDE_VERSION} (Claude Code)`)
    .answer(`git -C ${home}/projects/widgets/clone remote get-url origin`, 'git@github.com:acme/widgets.git')
    .answer('memory_pressure -Q', 'System-wide memory free percentage: 61%')
    .answer('sysctl -n kern.memorystatus_vm_pressure_level', '1')
    .answer('/usr/bin/sandbox-exec -p', '');
}

export interface CapturedOutput {
  readonly lines: string[];
  readonly errors: string[];
}

export function capturedOutput(): CapturedOutput {
  return { lines: [], errors: [] };
}

/** A command-line context over a temporary home, where nothing opens an installation unless the test says how. */
export function cliContext(home: string, captured: CapturedOutput, config: () => Promise<AgentFactoryConfig>, overrides: Partial<CliContext> = {}): CliContext {
  return {
    environment: { AGENT_FACTORY_HOME: home },
    output: { line: (text) => captured.lines.push(text), error: (text) => captured.errors.push(text) },
    runner: healthyRunner(home),
    files: new NodeWorkspaceFiles(),
    clock: { now: () => NOW },
    platform: 'darwin',
    userHome: home,
    workingDirectory: home,
    loadConfig: config,
    openInstallation: () => Promise.reject(new Error('this test opens no installation')),
    openEventLog: (loaded) => openEventLog(loaded.directories.state),
    ...overrides,
  };
}

export function gitIn(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: { ...process.env, ...ISOLATED_GIT_ENVIRONMENT }, encoding: 'utf8' }).trim();
}

/** A repository with one commit and, when given, an origin. */
export function seedRepository(path: string, origin: string | null): void {
  gitIn(path, 'init', '--quiet', '--initial-branch', 'main');
  gitIn(path, 'commit', '--quiet', '--allow-empty', '--message', 'seed');
  if (origin !== null) gitIn(path, 'remote', 'add', 'origin', origin);
}
