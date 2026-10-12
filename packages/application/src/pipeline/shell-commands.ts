import type { CommandRunner, CommandSandbox } from '../ports.ts';
import type { NamedCommand } from './pipeline-settings.ts';

export const SHELL_EXECUTABLE = '/bin/sh';
export const SHELL_COMMAND_FLAG = '-c';
export const NICE_EXECUTABLE = 'nice';
export const NICE_ADJUSTMENT_FLAG = '-n';
export const EXIT_CODE_SUCCESS = 0;
export const EXIT_CODE_NOT_EXECUTABLE = 126;
export const EXIT_CODE_NOT_FOUND = 127;
export const FAILURE_TAIL_LINES = 60;

const NOT_RUNNABLE_EXIT_CODES: readonly number[] = [EXIT_CODE_NOT_EXECUTABLE, EXIT_CODE_NOT_FOUND];
const NEWLINE = '\n';
const SPACE = ' ';
const COMMAND_PREFIX = '$ ';
const ESCAPE_CHARACTER = String.fromCharCode(27);
const ANSI_SEQUENCE = new RegExp(`${ESCAPE_CHARACTER}\\[[0-9;?]*[ -/]*[@-~]`, 'g');
const STATUS_LINE = /^\[(?:exit code \d+ after \d+ ms|could not start: .*|timed out after \d+ ms|the shell could not run it \(exit code \d+\))\]$/m;

export interface CommandAccess {
  readonly network: boolean;
}

export interface ShellCommandsSettings {
  /** Whether every command shares the host's loopback, as the commands inside a stack do. */
  readonly hostLoopback: boolean;
}

const OWN_LOOPBACK: ShellCommandsSettings = { hostLoopback: false };

export const OFFLINE: CommandAccess = { network: false };

export function accessOf(command: NamedCommand): CommandAccess {
  return { network: command.network !== undefined };
}

export type ShellOutcome =
  | { readonly kind: 'completed'; readonly exitCode: number; readonly output: string; readonly durationMs: number }
  | { readonly kind: 'not-runnable'; readonly reason: string; readonly output: string };

export type ShellRun =
  | { readonly started: false; readonly reason: string }
  | {
      readonly started: true;
      readonly exitCode: number;
      readonly timedOut: boolean;
      readonly output: string;
      readonly durationMs: number;
      readonly timeoutMs: number;
    };

export function isNotRunnableExitCode(exitCode: number): boolean {
  return NOT_RUNNABLE_EXIT_CODES.includes(exitCode);
}

export function tailLines(text: string, maxLines: number = FAILURE_TAIL_LINES): string {
  return text.trimEnd().split(NEWLINE).slice(-maxLines).join(NEWLINE);
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_SEQUENCE, '');
}

function combinedOutput(stdout: string, stderr: string): string {
  return stripAnsi([stdout.trimEnd(), stderr.trimEnd()].filter((part) => part !== '').join(NEWLINE));
}

export function shellInvocation(command: string): readonly string[] {
  return [SHELL_EXECUTABLE, SHELL_COMMAND_FLAG, command];
}

export class ShellCommands {
  private readonly runner: CommandRunner;
  private readonly sandbox: CommandSandbox;
  private readonly environment: Readonly<Record<string, string>>;
  private readonly timeoutMs: number;
  private readonly niceness: number | null;
  private readonly prefix: readonly string[];
  private readonly settings: ShellCommandsSettings;

  constructor(
    runner: CommandRunner,
    sandbox: CommandSandbox,
    environment: Readonly<Record<string, string>>,
    timeoutMs: number,
    niceness: number | null,
    settings: ShellCommandsSettings = OWN_LOOPBACK,
  ) {
    this.runner = runner;
    this.sandbox = sandbox;
    this.environment = environment;
    this.timeoutMs = timeoutMs;
    this.niceness = niceness;
    this.prefix = niceness === null ? [] : [NICE_EXECUTABLE, NICE_ADJUSTMENT_FLAG, String(niceness)];
    this.settings = settings;
  }

  /** The same commands with more variables, sharing the host's loopback: the commands that run inside a stack. */
  insideStack(environment: Readonly<Record<string, string>>): ShellCommands {
    return new ShellCommands(this.runner, this.sandbox, { ...this.environment, ...environment }, this.timeoutMs, this.niceness, { hostLoopback: true });
  }

  /** The variables every command gets. */
  get variables(): Readonly<Record<string, string>> {
    return this.environment;
  }

  /** The argument list that runs a shell line confined, as `run` starts it. */
  confined(command: string, cwd: string, access: CommandAccess = OFFLINE): readonly string[] {
    return [...this.prefix, ...this.sandbox.confine(shellInvocation(command), { workingDirectory: cwd, network: access.network, hostLoopback: this.settings.hostLoopback })];
  }

  async run(command: string, cwd: string, access: CommandAccess = OFFLINE, timeoutMs: number = this.timeoutMs): Promise<ShellRun> {
    const started = await this.runner
      .run(this.confined(command, cwd, access), cwd, timeoutMs, this.environment)
      .then((value) => ({ ok: true as const, value }))
      .catch((error: unknown) => ({ ok: false as const, error }));
    if (!started.ok) {
      const message = started.error instanceof Error ? started.error.message : String(started.error);
      return { started: false, reason: `could not start: ${message}` };
    }
    const result = started.value;
    return {
      started: true,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      output: combinedOutput(result.stdout, result.stderr),
      durationMs: result.durationMs,
      timeoutMs,
    };
  }

  async execute(command: string, cwd: string, access: CommandAccess = OFFLINE): Promise<ShellOutcome> {
    const run = await this.run(command, cwd, access);
    if (!run.started) return { kind: 'not-runnable', reason: run.reason, output: '' };
    if (run.timedOut) return { kind: 'not-runnable', reason: `timed out after ${run.timeoutMs} ms`, output: run.output };
    if (NOT_RUNNABLE_EXIT_CODES.includes(run.exitCode)) {
      return { kind: 'not-runnable', reason: `the shell could not run it (exit code ${run.exitCode})`, output: run.output };
    }
    return { kind: 'completed', exitCode: run.exitCode, output: run.output, durationMs: run.durationMs };
  }
}

export function describeOutcome(command: string, outcome: ShellOutcome): string {
  const status = outcome.kind === 'completed' ? `exit code ${outcome.exitCode} after ${outcome.durationMs} ms` : outcome.reason;
  return [`$ ${command}`, outcome.output, `[${status}]`].filter((part) => part !== '').join(NEWLINE);
}

function namesCommand(line: string, command: string): boolean {
  if (!line.startsWith(COMMAND_PREFIX)) return false;
  const invocation = line.slice(COMMAND_PREFIX.length);
  let index = invocation.indexOf(command);
  while (index !== -1) {
    const before = index === 0 ? SPACE : invocation[index - 1];
    const after = invocation[index + command.length] ?? SPACE;
    if (before === SPACE && after === SPACE) return true;
    index = invocation.indexOf(command, index + 1);
  }
  return false;
}

function blockStart(log: string, command: string): number {
  let offset = 0;
  for (const line of log.split(NEWLINE)) {
    if (namesCommand(line, command)) return offset;
    offset += line.length + NEWLINE.length;
  }
  return -1;
}

export function commandSection(log: string, command: string): string | null {
  const start = blockStart(log, command);
  if (start === -1) return null;
  const rest = log.slice(start);
  const status = STATUS_LINE.exec(rest);
  return status === null ? rest : rest.slice(0, status.index + status[0].length);
}
