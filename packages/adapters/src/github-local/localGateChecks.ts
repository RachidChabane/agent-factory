import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { CheckRunSummary, Clock } from '@agent-factory/application';
import { SerialQueue } from '../git/serialQueue.ts';

/** The directory of a local forge where the outcome of each commit's gate is kept. */
export const CHECKS_DIRECTORY = 'checks';
const OUTCOME_EXTENSION = '.json';
const LOG_EXTENSION = '.log';
const JSON_INDENT = 2;
const UTF8 = 'utf8';
/** The name of the check while the gate of a commit is still running. */
export const RUNNING_GATE_CHECK = 'gate';

/**
 * When the gate of a commit runs once its checks are asked for: in the `background` of a factory that keeps
 * running, which answers pending meanwhile, or `awaited` by a command that ends once it has answered.
 */
export const LOCAL_CHECK_SCHEDULINGS = ['background', 'awaited'] as const;
export type LocalCheckScheduling = (typeof LOCAL_CHECK_SCHEDULINGS)[number];

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
 * The checks of a local forge: the first time a commit's checks are asked for, its gate starts; in the
 * background, the commit shows one pending check meanwhile, and awaited, the answer waits for the gate.
 * Once the gate has run, each step is a check that passed or failed, with the gate's log as its link. A
 * gate that could not run at all shows as one failed check whose log says why.
 */
function checksOf(outcome: Outcome, url: string): readonly CheckRunSummary[] {
  return outcome.steps.map((step) => ({ name: step.name, conclusion: step.passed ? 'success' : 'failure', url, durationMs: step.durationMs }));
}

export class LocalGateChecks {
  private readonly directory: string;
  private readonly runner: LocalCheckRunner;
  private readonly clock: Clock;
  private readonly signal: AbortSignal;
  private readonly scheduling: LocalCheckScheduling;
  private readonly running = new Map<string, Promise<void>>();
  /** One gate at a time, as a forge with a single runner: gates of several commits wait their turn. */
  private readonly queue = new SerialQueue();

  constructor(forgeDirectory: string, runner: LocalCheckRunner, clock: Clock, signal: AbortSignal, scheduling: LocalCheckScheduling = 'background') {
    this.directory = join(forgeDirectory, CHECKS_DIRECTORY);
    this.runner = runner;
    this.clock = clock;
    this.signal = signal;
    this.scheduling = scheduling;
  }

  async of(sha: string): Promise<readonly CheckRunSummary[]> {
    const url = pathToFileURL(this.logPath(sha)).href;
    const outcome = await this.readOutcome(sha);
    if (outcome !== null) return checksOf(outcome, url);
    const run = this.start(sha);
    if (this.scheduling === 'awaited' && run !== null) {
      await run;
      const settled = await this.readOutcome(sha);
      if (settled !== null) return checksOf(settled, url);
    }
    return [{ name: RUNNING_GATE_CHECK, conclusion: 'pending', url, durationMs: null }];
  }

  /** Settles once every gate started so far has finished. */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.running.values()]);
  }

  private start(sha: string): Promise<void> | null {
    if (this.signal.aborted) return null;
    const started = this.running.get(sha);
    if (started !== undefined) return started;
    const run = this.queue.run(() => this.runGate(sha)).finally(() => this.running.delete(sha));
    this.running.set(sha, run);
    return run;
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
