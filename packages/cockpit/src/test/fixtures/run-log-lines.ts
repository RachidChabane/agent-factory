import type { RunLogLine } from '../../contract/index.ts';
import type { ScriptStep } from './script-builder.ts';

const MINIMUM_STEP_MS = 1;

/**
 * Spreads the steps of a script over a time window, in proportion to their weights: the first line
 * falls shortly after the window opens and the last one at the instant the window closes.
 */
export function stampSteps(runId: string, steps: readonly ScriptStep[], startMs: number, endMs: number): RunLogLine[] {
  const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);
  const window = endMs - startMs;
  let elapsedWeight = 0;
  let previous = startMs;
  return steps.map((step, index) => {
    elapsedWeight += step.weight;
    const at = Math.max(previous + MINIMUM_STEP_MS, Math.round(startMs + (window * elapsedWeight) / totalWeight));
    previous = at;
    return { runId, index, at: new Date(at).toISOString(), event: step.event };
  });
}
