import type { Clock } from '@agent-factory/application';
import type { CliOutput } from '../cli/output.ts';
import { formatSeconds } from './format.ts';

const PASSED_MARK = 'ok  ';
const FAILED_MARK = 'FAIL';
const SUMMARY_PREFIX = 'e2e-example:';
const SINGLE_STEP = 1;

export type LineOutput = Pick<CliOutput, 'line'>;

/** Reports the run one line per step, as the validation of the installation does, and sums it up at the end. */
export class StepJournal {
  private readonly output: LineOutput;
  private readonly clock: Clock;
  private readonly startedAt: number;
  private passedSteps = 0;
  private failedStep: string | null = null;

  constructor(output: LineOutput, clock: Clock) {
    this.output = output;
    this.clock = clock;
    this.startedAt = clock.now().getTime();
  }

  /** Runs one step; a step that throws is reported as failed and its error goes on to the caller. */
  async step<T>(name: string, action: () => Promise<T>, detail: (result: T) => string = () => ''): Promise<T> {
    try {
      const result = await action();
      this.passedSteps += 1;
      const text = detail(result);
      this.output.line(`${PASSED_MARK} ${text === '' ? name : `${name}: ${text}`}`);
      return result;
    } catch (error) {
      this.failedStep ??= name;
      this.output.line(`${FAILED_MARK} ${name}`);
      throw error;
    }
  }

  summary(): string {
    const elapsed = formatSeconds(this.clock.now().getTime() - this.startedAt);
    const steps = `${this.passedSteps} ${this.passedSteps === SINGLE_STEP ? 'step' : 'steps'} passed`;
    return this.failedStep === null ? `${SUMMARY_PREFIX} ${steps} in ${elapsed}` : `${SUMMARY_PREFIX} failed at "${this.failedStep}" after ${steps} (${elapsed})`;
  }
}
