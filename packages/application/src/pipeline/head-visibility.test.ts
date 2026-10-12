import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { headVisibilityPolicy, HEAD_VISIBILITY_ATTEMPTS, HEAD_VISIBILITY_DELAY_MS, pollWithinBound, type HeadVisibilityPolicy } from './head-visibility.ts';
import { RecordingSleeper } from './testing/pipeline-fakes.ts';

function policyOf(sleeper: RecordingSleeper, attempts: number): HeadVisibilityPolicy {
  return { sleeper, signal: new AbortController().signal, attempts, delayMs: HEAD_VISIBILITY_DELAY_MS };
}

describe('pollWithinBound', () => {
  it('returns the value of the first probe that is done, pausing once between two probes', async () => {
    const sleeper = new RecordingSleeper();
    let reads = 0;

    const value = await pollWithinBound(policyOf(sleeper, HEAD_VISIBILITY_ATTEMPTS), async () => {
      reads += 1;
      return reads === 3 ? { done: true, value: 'seen' } : { done: false };
    });

    expect(value).toBe('seen');
    expect(reads).toBe(3);
    expect(sleeper.naps).toEqual([HEAD_VISIBILITY_DELAY_MS, HEAD_VISIBILITY_DELAY_MS]);
  });

  it('never pauses after the last attempt, and returns null when nothing was ever done', async () => {
    const sleeper = new RecordingSleeper();

    const value = await pollWithinBound(policyOf(sleeper, HEAD_VISIBILITY_ATTEMPTS), async () => ({ done: false }));

    expect(value).toBeNull();
    expect(sleeper.naps).toHaveLength(HEAD_VISIBILITY_ATTEMPTS - 1);
  });

  it('reads at most the attempts of the policy, whatever they are, and pauses one time fewer', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 40 }), async (attempts) => {
        const sleeper = new RecordingSleeper();
        let reads = 0;
        await pollWithinBound(policyOf(sleeper, attempts), async () => {
          reads += 1;
          return { done: false };
        });
        expect(reads).toBe(attempts);
        expect(sleeper.naps).toHaveLength(attempts - 1);
      }),
    );
  });

  it('builds the default policy from the named bounds', () => {
    const sleeper = new RecordingSleeper();
    const signal = new AbortController().signal;
    expect(headVisibilityPolicy(sleeper, signal)).toEqual({ sleeper, signal, attempts: HEAD_VISIBILITY_ATTEMPTS, delayMs: HEAD_VISIBILITY_DELAY_MS });
  });
});
