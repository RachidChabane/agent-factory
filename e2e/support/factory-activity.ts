import type { CockpitSnapshot } from '../../packages/cockpit/src/contract/index.ts';
import type { RunningFactory } from './factory.ts';

const MINUTE_MS = 60_000;

/** How long the scripted agents may take to finish the work a click started, from the first run to the last. */
export const AGENT_WORK_TIMEOUT_MS = 3 * MINUTE_MS;

/** The room a test needs when it waits for the agents to start the work and again for them to leave the factory idle. */
export const AGENT_WORK_TEST_TIMEOUT_MS = 2 * AGENT_WORK_TIMEOUT_MS + MINUTE_MS;

const RUNNING = 'running';

function noAgentIsWorking(state: CockpitSnapshot): boolean {
  const { running, queued } = state.installation.runSlots;
  return running === 0 && queued === 0 && state.runs.every((run) => run.status !== RUNNING);
}

/** Waits until no agent run is in progress, so that the next spec finds the factory as idle as the demonstration leaves it. */
export function untilNoAgentIsWorking(factory: RunningFactory): Promise<CockpitSnapshot> {
  return factory.api.until('no agent run is in progress', noAgentIsWorking, { timeoutMs: AGENT_WORK_TIMEOUT_MS });
}
