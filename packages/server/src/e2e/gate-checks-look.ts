import { describeRun, type CliRun } from './factory-cli.ts';
import { lastLines, shortSha } from './format.ts';
import type { GateOutcome } from './local-forge.ts';
import { failed, ready, waiting, type Poll } from './wait-until.ts';
import type { StateAnswer } from './cockpit-client.ts';

const FAILED_GATE_LOG_LINES = 40;
const NO_LOG = '(no log)';

/** What the wait for the checks of a commit looks at. */
export interface GateChecksSources {
  /** Asks the running factory for the state its cockpit shows, which has a local forge start the gate of a commit. */
  requestState(): Promise<StateAnswer>;
  outcome(sha: string): Promise<GateOutcome | null>;
  log(sha: string): Promise<string | null>;
  /** The run of the factory process once it has ended; null while it still runs. */
  factoryEnded(): CliRun | null;
}

/**
 * One look at the checks of a commit: they are ready once the local forge records every step of
 * the gate as passed, and the wait ends at once when the factory is gone or a step failed.
 */
export function gateChecksLook(sha: string, sources: GateChecksSources): () => Promise<Poll<GateOutcome>> {
  const commit = shortSha(sha);
  return async () => {
    const ended = sources.factoryEnded();
    if (ended !== null) return failed(`the factory ended before the checks of ${commit} were recorded: ${describeRun(ended)}`);
    const answer = await sources.requestState();
    const outcome = await sources.outcome(sha);
    if (outcome === null) return waiting(`no checks recorded for ${commit} yet (${answer.detail})`);
    const failedSteps = outcome.steps.filter((step) => !step.passed).map((step) => step.name);
    if (failedSteps.length === 0) return ready(outcome);
    const log = (await sources.log(sha)) ?? NO_LOG;
    return failed(`the gate of ${commit} failed at ${failedSteps.join(', ')}\n${lastLines(log.trimEnd(), FAILED_GATE_LOG_LINES)}`);
  };
}
