import { CommandAbortedError } from '@agent-factory/adapters';
import type { CommandRunner } from '@agent-factory/application';
import { PROGRAM_NAME } from '../cli/command-line.ts';
import { EXIT_CODES } from '../cli/output.ts';
import { expectThat } from './expectations.ts';
import { joinWords, lastLines } from './format.ts';

const NOT_EXITED = -1;
const FAILURE_OUTPUT_LINES = 40;

/** One run of a factory command, as the operator would have seen it. */
export interface CliRun {
  /** The command as typed at a prompt. */
  readonly command: string;
  readonly exitCode: number;
  /** What the command printed: its standard output, then its standard error. */
  readonly output: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  /** The run was ended from outside while the command still ran. */
  readonly killed: boolean;
}

export interface FactoryCliSettings {
  /** The module that runs the command line. */
  readonly entry: string;
  readonly workingDirectory: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly commandTimeoutMs: number;
}

export function describeCommand(args: readonly string[]): string {
  return joinWords([PROGRAM_NAME, ...args]);
}

/** How a run that did not end by itself ended, or null when it exited. */
export function endNote(run: CliRun): string | null {
  if (run.killed) return 'killed';
  return run.timedOut ? 'timed out' : null;
}

export function describeRun(run: CliRun): string {
  const note = endNote(run);
  return `exit code ${run.exitCode}${note === null ? '' : ` (${note})`}\n${lastLines(run.output.trimEnd(), FAILURE_OUTPUT_LINES)}`;
}

export function expectSucceeded(run: CliRun): CliRun {
  expectThat(run.exitCode === EXIT_CODES.ok && !run.timedOut && !run.killed, `${run.command} succeeds`, `exit code ${EXIT_CODES.ok}`, describeRun(run));
  return run;
}

/**
 * Runs the factory's command line as a child process of this one, on the installation of one
 * factory home, and keeps what each command printed for the report of a failed run.
 */
export class FactoryCli {
  private readonly settings: FactoryCliSettings;
  private readonly runner: CommandRunner;
  private readonly runs: CliRun[] = [];

  constructor(settings: FactoryCliSettings, runner: CommandRunner) {
    this.settings = settings;
    this.runner = runner;
  }

  /** Runs a command to its end. */
  async run(args: readonly string[]): Promise<CliRun> {
    const command = describeCommand(args);
    const startedAt = performance.now();
    const { entry, workingDirectory, environment, commandTimeoutMs } = this.settings;
    try {
      const result = await this.runner.run([process.execPath, entry, ...args], workingDirectory, commandTimeoutMs, environment);
      return this.record({ command, exitCode: result.exitCode, output: `${result.stdout}${result.stderr}`, durationMs: result.durationMs, timedOut: result.timedOut, killed: false });
    } catch (error) {
      if (!(error instanceof CommandAbortedError)) throw error;
      return this.record({ command, exitCode: NOT_EXITED, output: '', durationMs: Math.round(performance.now() - startedAt), timedOut: false, killed: true });
    }
  }

  /** Every command run so far that has ended, in the order it ended. */
  transcript(): readonly CliRun[] {
    return this.runs;
  }

  private record(run: CliRun): CliRun {
    this.runs.push(run);
    return run;
  }
}
