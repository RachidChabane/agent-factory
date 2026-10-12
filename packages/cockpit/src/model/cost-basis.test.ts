import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../test/render.tsx';
import { costBasisOfBilling, costBasisOfRun } from './cost-basis.ts';
import { tokenTotalsOfUsage } from './tokens.ts';

describe('cost basis', () => {
  it('follows the billing of the account', () => {
    expect(costBasisOfBilling('subscription')).toBe('subscription-equivalent');
    expect(costBasisOfBilling('api-key')).toBe('metered');
  });

  it('gives the basis of a run from the account that ran it', () => {
    const snapshot = fixtureSnapshot();
    expect(costBasisOfRun(snapshot, { account: 'personal' })).toBe('subscription-equivalent');
    expect(costBasisOfRun(snapshot, { account: 'shared' })).toBe('metered');
  });

  it('falls back on the basis of the installation for a run of an unknown account', () => {
    const snapshot = fixtureSnapshot();
    expect(costBasisOfRun(snapshot, { account: null })).toBe(snapshot.costs.basis);
    expect(costBasisOfRun(snapshot, { account: 'gone' })).toBe(snapshot.costs.basis);
  });
});

describe('token totals', () => {
  it('states the total of a run both with and without the cache tokens', () => {
    expect(tokenTotalsOfUsage({ inputTokens: 100, outputTokens: 40, cacheReadTokens: 5_000, cacheCreationTokens: 300 })).toEqual({
      input: 100,
      output: 40,
      cacheRead: 5_000,
      cacheCreation: 300,
      withoutCache: 140,
      withCache: 5_440,
    });
  });
});
