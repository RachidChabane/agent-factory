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

/** A command that keeps running until it is asked to stop or killed. */
export interface LaunchedCommand {
  /** Settles when the command has ended, whatever the way; it does not reject. */
  readonly finished: Promise<CliRun>;
  /** Ends the command and everything it started. */
  kill(): void;
}

/** Builds the runner of commands that are killed when the signal aborts. */
export type RunnerFor = (signal: AbortSignal) => CommandRunner;

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
  private readonly runnerFor: RunnerFor;
  private readonly lifetime: AbortSignal;
  private readonly runs: CliRun[] = [];

  constructor(settings: FactoryCliSettings, runnerFor: RunnerFor, lifetime: AbortSignal) {
    this.settings = settings;
    this.runnerFor = runnerFor;
    this.lifetime = lifetime;
  }

  /** Runs a command to its end. */
  run(args: readonly string[]): Promise<CliRun> {
    return this.execute(args, this.lifetime, this.settings.commandTimeoutMs);
  }

  /** Starts a command that is left running; the run ends at `lifetimeLimitMs` at the latest. */
  launch(args: readonly string[], lifetimeLimitMs: number): LaunchedCommand {
    const controller = new AbortController();
    const startedAt = performance.now();
    const finished = this.execute(args, AbortSignal.any([this.lifetime, controller.signal]), lifetimeLimitMs).catch((error: unknown) =>
      this.unfinished(describeCommand(args), startedAt, `could not start: ${error instanceof Error ? error.message : String(error)}`, false),
    );
    return { finished, kill: () => controller.abort() };
  }

  /** Every command run so far that has ended, in the order it ended. */
  transcript(): readonly CliRun[] {
    return this.runs;
  }

  private async execute(args: readonly string[], signal: AbortSignal, timeoutMs: number): Promise<CliRun> {
    const command = describeCommand(args);
    const startedAt = performance.now();
    const { entry, workingDirectory, environment } = this.settings;
    try {
      const result = await this.runnerFor(signal).run([process.execPath, entry, ...args], workingDirectory, timeoutMs, environment);
      return this.record({ command, exitCode: result.exitCode, output: `${result.stdout}${result.stderr}`, durationMs: result.durationMs, timedOut: result.timedOut, killed: false });
    } catch (error) {
      if (!(error instanceof CommandAbortedError)) throw error;
      return this.unfinished(command, startedAt, '', true);
    }
  }

  /** A run that has no exit code: the command never started, or was ended before it exited. */
  private unfinished(command: string, startedAt: number, output: string, killed: boolean): CliRun {
    return this.record({ command, exitCode: NOT_EXITED, output, durationMs: Math.round(performance.now() - startedAt), timedOut: false, killed });
  }

  private record(run: CliRun): CliRun {
    this.runs.push(run);
    return run;
  }
}
