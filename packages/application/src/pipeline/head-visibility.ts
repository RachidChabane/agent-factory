import type { Sleeper } from '../ports.ts';

export const HEAD_VISIBILITY_ATTEMPTS = 10;
export const HEAD_VISIBILITY_DELAY_MS = 3_000;

/** How long a use case waits for the forge to show what it just wrote: the reads it makes, and the pause between them. */
export interface HeadVisibilityPolicy {
  readonly sleeper: Sleeper;
  readonly signal: AbortSignal;
  readonly attempts: number;
  readonly delayMs: number;
}

export function headVisibilityPolicy(sleeper: Sleeper, signal: AbortSignal): HeadVisibilityPolicy {
  return { sleeper, signal, attempts: HEAD_VISIBILITY_ATTEMPTS, delayMs: HEAD_VISIBILITY_DELAY_MS };
}

export type Probe<T> = { readonly done: true; readonly value: T } | { readonly done: false };

/** Runs the probe up to the policy's attempts, pausing between them; null when no attempt was done. */
export async function pollWithinBound<T>(policy: HeadVisibilityPolicy, probe: () => Promise<Probe<T>>): Promise<T | null> {
  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    const result = await probe();
    if (result.done) return result.value;
    if (attempt < policy.attempts) await policy.sleeper.sleep(policy.delayMs, policy.signal);
  }
  return null;
}
