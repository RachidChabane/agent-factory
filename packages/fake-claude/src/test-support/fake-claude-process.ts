import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STOP_HOOK_BLOCK_CAP_VARIABLE } from '../cli/stop-hook-cap.ts';
import { parseJsonLines, type JsonObject } from './json-navigation.ts';
import type { Sandbox } from './sandbox.ts';

export const MAIN_SCRIPT = fileURLToPath(new URL('../main.ts', import.meta.url));

const PROCESS_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const NODE_EXECUTABLE = process.execPath;

export interface Invocation {
  /** Written to standard input; standard input is closed and empty when absent. */
  readonly prompt?: string;
  /** Flags after the two the fake owns; defaults to the flags the factory passes. */
  readonly flags?: readonly string[];
  /** Added to the environment this test process runs in. */
  readonly environment?: Readonly<Record<string, string>>;
  /** Replaces the whole environment, as the factory does when it launches the CLI. */
  readonly exactEnvironment?: Readonly<Record<string, string>>;
  readonly workingDirectory?: string;
  /** Replaces the flags the fake owns, `--scenario <sandbox scenario> --state <sandbox state>` by default. */
  readonly ownFlags?: readonly string[];
}

export interface Completed {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly lines: readonly JsonObject[];
}

export function factoryFlags(settingsFile: string | null): readonly string[] {
  return [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--include-hook-events',
    '--permission-mode',
    'dontAsk',
    '--setting-sources',
    'project,local',
    '--strict-mcp-config',
    '--model',
    'haiku',
    '--effort',
    'low',
    '--max-turns',
    '10',
    '--max-budget-usd',
    '1',
    ...(settingsFile === null ? [] : ['--settings', settingsFile]),
    '--tools',
    'Read,Write,Bash',
    '--allowedTools',
    'Read,Write',
  ];
}

function argumentsFor(sandbox: Sandbox, invocation: Invocation): readonly string[] {
  const ownFlags = invocation.ownFlags ?? ['--scenario', sandbox.scenarioFile, '--state', sandbox.state];
  return [MAIN_SCRIPT, ...ownFlags, ...(invocation.flags ?? factoryFlags(null))];
}

function environmentFor(invocation: Invocation): NodeJS.ProcessEnv {
  if (invocation.exactEnvironment !== undefined) {
    return { ...invocation.exactEnvironment };
  }
  const inherited = Object.entries(process.env).filter(([name]) => name !== STOP_HOOK_BLOCK_CAP_VARIABLE);
  return { ...Object.fromEntries(inherited), ...invocation.environment };
}

export function runFakeClaude(sandbox: Sandbox, invocation: Invocation = {}): Completed {
  const result = spawnSync(NODE_EXECUTABLE, argumentsFor(sandbox, invocation), {
    cwd: invocation.workingDirectory ?? sandbox.worktree,
    env: environmentFor(invocation),
    encoding: 'utf8',
    input: invocation.prompt ?? '',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: PROCESS_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  return completed(result.status, result.stdout, result.stderr);
}

export function runFakeClaudeWithoutStandardInput(sandbox: Sandbox, invocation: Invocation = {}): Completed {
  const result = spawnSync(NODE_EXECUTABLE, argumentsFor(sandbox, invocation), {
    cwd: invocation.workingDirectory ?? sandbox.worktree,
    env: environmentFor(invocation),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: PROCESS_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  return completed(result.status, result.stdout, result.stderr);
}

export function runFakeClaudeAsync(sandbox: Sandbox, invocation: Invocation = {}): Promise<Completed> {
  return new Promise((resolve, reject) => {
    const child = spawn(NODE_EXECUTABLE, argumentsFor(sandbox, invocation), {
      cwd: invocation.workingDirectory ?? sandbox.worktree,
      env: environmentFor(invocation),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (status) => resolve(completed(status, stdout, stderr)));
    child.stdin.end(invocation.prompt ?? '');
  });
}

function completed(status: number | null, stdout: string, stderr: string): Completed {
  return { status, stdout, stderr, lines: parseJsonLines(stdout) };
}
