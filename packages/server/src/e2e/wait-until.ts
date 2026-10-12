import type { Clock, Sleeper } from '@agent-factory/application';
import { ExpectationFailed } from './expectations.ts';
import { formatSeconds } from './format.ts';

/** What one look at the thing waited for shows. */
export type Poll<T> =
  | { readonly kind: 'ready'; readonly value: T }
  | { readonly kind: 'waiting'; readonly observed: string }
  | { readonly kind: 'failed'; readonly reason: string };

export function ready<T>(value: T): Poll<T> {
  return { kind: 'ready', value };
}

export function waiting(observed: string): Poll<never> {
  return { kind: 'waiting', observed };
}

export function failed(reason: string): Poll<never> {
  return { kind: 'failed', reason };
}

export interface WaitSettings {
  /** What is waited for, as a sentence that reads after "waiting for". */
  readonly what: string;
  readonly timeoutMs: number;
  readonly intervalMs: number;
  readonly clock: Clock;
  readonly sleeper: Sleeper;
  readonly signal: AbortSignal;
}

/**
 * Looks at something every interval until it is ready. A failed look ends the wait at once with
 * its reason; a wait that outlasts its timeout ends with the last thing observed.
 */
export async function waitUntil<T>(settings: WaitSettings, look: () => Promise<Poll<T>>): Promise<T> {
  const { what, timeoutMs, intervalMs, clock, sleeper, signal } = settings;
  const deadline = clock.now().getTime() + timeoutMs;
  for (;;) {
    if (signal.aborted) throw new ExpectationFailed(`waiting for ${what}`, 'the run to go on', 'the run was interrupted');
    const poll = await look();
    if (poll.kind === 'ready') return poll.value;
    if (poll.kind === 'failed') throw new ExpectationFailed(`waiting for ${what}`, 'it to happen', poll.reason);
    if (clock.now().getTime() >= deadline) {
      throw new ExpectationFailed(`waiting for ${what}`, `it to happen within ${formatSeconds(timeoutMs)}`, `still waiting: ${poll.observed}`);
    }
    await sleeper.sleep(intervalMs, signal);
  }
}
