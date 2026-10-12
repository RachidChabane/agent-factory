import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { CheckRunSummary, Clock } from '@agent-factory/application';

/** The directory of a local forge where the outcome of each commit's gate is kept. */
export const CHECKS_DIRECTORY = 'checks';
const OUTCOME_EXTENSION = '.json';
const LOG_EXTENSION = '.log';
const JSON_INDENT = 2;
const UTF8 = 'utf8';
/** The name of the check while the gate of a commit is still running. */
export const RUNNING_GATE_CHECK = 'gate';

/** One step of a project's gate on a commit, as a continuous integration job reports it. */
export interface LocalCheckStep {
  readonly name: string;
  readonly passed: boolean;
  /** How long the step ran; null when it could not start. */
  readonly durationMs: number | null;
}

export interface LocalCheckRun {
  readonly steps: readonly LocalCheckStep[];
  /** What the steps printed, kept as the log the checks link to. */
  readonly log: string;
}

/** Runs a project's own gate on a commit of its local forge, as a forge's continuous integration would. */
export interface LocalCheckRunner {
  run(sha: string, signal: AbortSignal): Promise<LocalCheckRun>;
}

const OutcomeSchema = z.object({
  sha: z.string().min(1),
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }),
  steps: z.array(z.object({ name: z.string().min(1), passed: z.boolean(), durationMs: z.number().nonnegative().nullable().default(null) })),
});
type Outcome = z.infer<typeof OutcomeSchema>;

/**
 * The checks of a local forge: the first time a commit's checks are asked for, its gate starts in
 * the background and the commit shows one pending check; once the gate has run, each step is a
 * check that passed or failed, with the gate's log as its link. A gate that could not run at all
 * shows as one failed check whose log says why.
 */
export class LocalGateChecks {
  private readonly directory: string;
  private readonly runner: LocalCheckRunner;
  private readonly clock: Clock;
  private readonly signal: AbortSignal;
  private readonly running = new Map<string, Promise<void>>();

  constructor(forgeDirectory: string, runner: LocalCheckRunner, clock: Clock, signal: AbortSignal) {
    this.directory = join(forgeDirectory, CHECKS_DIRECTORY);
    this.runner = runner;
    this.clock = clock;
    this.signal = signal;
  }

  async of(sha: string): Promise<readonly CheckRunSummary[]> {
    const outcome = await this.readOutcome(sha);
    const url = pathToFileURL(this.logPath(sha)).href;
    if (outcome !== null) return outcome.steps.map((step) => ({ name: step.name, conclusion: step.passed ? 'success' : 'failure', url, durationMs: step.durationMs }));
    this.start(sha);
    return [{ name: RUNNING_GATE_CHECK, conclusion: 'pending', url, durationMs: null }];
  }

  /** Settles once every gate started so far has finished. */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.running.values()]);
  }

  private start(sha: string): void {
    if (this.running.has(sha) || this.signal.aborted) return;
    const run = this.runGate(sha).finally(() => this.running.delete(sha));
    this.running.set(sha, run);
  }

  private async runGate(sha: string): Promise<void> {
    const startedAt = this.clock.now().toISOString();
    let result: LocalCheckRun;
    try {
      result = await this.runner.run(sha, this.signal);
    } catch (error) {
      if (this.signal.aborted) return;
      result = { steps: [{ name: RUNNING_GATE_CHECK, passed: false, durationMs: null }], log: `the gate could not run: ${error instanceof Error ? error.message : String(error)}\n` };
    }
    if (this.signal.aborted) return;
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.logPath(sha), result.log);
    const outcome: Outcome = { sha, startedAt, finishedAt: this.clock.now().toISOString(), steps: [...result.steps] };
    await writeFile(this.outcomePath(sha), `${JSON.stringify(outcome, null, JSON_INDENT)}\n`);
  }

  private async readOutcome(sha: string): Promise<Outcome | null> {
    const text = await readFile(this.outcomePath(sha), UTF8).catch(() => null);
    if (text === null) return null;
    const parsed = OutcomeSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  }

  private outcomePath(sha: string): string {
    return join(this.directory, `${sha}${OUTCOME_EXTENSION}`);
  }

  private logPath(sha: string): string {
    return join(this.directory, `${sha}${LOG_EXTENSION}`);
  }
}
