import type { Sleeper } from '@agent-factory/application';
import { GitHubCommandError } from './errors.ts';

/** How long to wait before each new try of a GitHub call that failed for a reason that passes. */
export const TRANSIENT_RETRY_DELAYS_MS: readonly number[] = [2_000, 8_000, 30_000];
const TRANSIENT_FAILURE =
  /\bHTTP (?:429|5\d\d)\b|\b50[234]\b|bad gateway|service unavailable|gateway time-?out|secondary rate limit|timed? ?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|connection reset|unexpected EOF|TLS handshake/i;
const NEVER_ABORTED = new AbortController().signal;

export const TIMER_SLEEPER: Sleeper = {
  sleep: (milliseconds, signal) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, milliseconds);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    }),
};

export interface RetrySettings {
  readonly delaysMs: readonly number[];
  readonly sleeper: Sleeper;
}

export const DEFAULT_RETRY_SETTINGS: RetrySettings = { delaysMs: TRANSIENT_RETRY_DELAYS_MS, sleeper: TIMER_SLEEPER };

/** A failure GitHub or the network may not repeat: a 5xx or 429 answer, a timeout, a reset connection. */
export function isTransientFailure(error: unknown): boolean {
  return error instanceof GitHubCommandError && (error.timedOut || TRANSIENT_FAILURE.test(error.stderr));
}

/**
 * Runs a call, and again after each delay while it fails for a transient reason. Before trying a
 * write again, `landed` says whether the failed try took effect anyway, as a request GitHub
 * completed before its answer was lost; its result is then returned instead of writing twice.
 */
export async function withTransientRetries<T>(call: () => Promise<T>, settings: RetrySettings, landed: () => Promise<T | null> = () => Promise.resolve(null)): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      const delay = settings.delaysMs[attempt];
      if (delay === undefined || !isTransientFailure(error)) throw error;
      await settings.sleeper.sleep(delay, NEVER_ABORTED);
      const done = await landed().catch(() => null);
      if (done !== null) return done;
    }
  }
}
