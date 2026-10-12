import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BACKOFF_BASE_MS, BACKOFF_CAP_MS, reconnectDelay } from './backoff.ts';

describe('reconnectDelay', () => {
  it('doubles until the cap and keeps half of the delay fixed', () => {
    expect(reconnectDelay(0, () => 0)).toBe(BACKOFF_BASE_MS / 2);
    expect(reconnectDelay(0, () => 1)).toBe(BACKOFF_BASE_MS);
    expect(reconnectDelay(3, () => 1)).toBe(BACKOFF_BASE_MS * 8);
    expect(reconnectDelay(40, () => 1)).toBe(BACKOFF_CAP_MS);
  });

  it('always stays within the jitter band', () => {
    fc.assert(
      fc.property(fc.nat(60), fc.double({ min: 0, max: 1, noNaN: true }), (attempt, random) => {
        const delay = reconnectDelay(attempt, () => random);
        const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
        return delay >= Math.floor(ceiling / 2) && delay <= Math.ceil(ceiling);
      }),
    );
  });
});
