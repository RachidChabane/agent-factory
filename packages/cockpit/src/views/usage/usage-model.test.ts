import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../i18n/formatters.ts';
import { TEST_NOW } from '../../test/harness.tsx';
import { limitKey, noLimitsReason, resetOf } from './usage-model.ts';

const minutesFromNow = (minutes: number) => new Date(TEST_NOW + minutes * MINUTE_MS).toISOString();

describe('resetOf', () => {
  it('tells a reset to come from one that already happened', () => {
    expect(resetOf({ resetsAt: minutesFromNow(5) }, TEST_NOW)).toEqual({ kind: 'upcoming', at: minutesFromNow(5) });
    expect(resetOf({ resetsAt: minutesFromNow(-5) }, TEST_NOW)).toEqual({ kind: 'elapsed', at: minutesFromNow(-5) });
  });

  it('reports a reset time the factory did not give', () => {
    expect(resetOf({ resetsAt: null }, TEST_NOW)).toEqual({ kind: 'unknown' });
  });
});

describe('limitKey', () => {
  it('tells two scoped limits of different models apart', () => {
    expect(limitKey({ kind: 'weekly_scoped', scope: 'opus' })).not.toBe(limitKey({ kind: 'weekly_scoped', scope: 'sonnet' }));
    expect(limitKey({ kind: 'session', scope: null })).toBe('session:');
  });
});

describe('noLimitsReason', () => {
  it('says an account billed by API key has no limit to read, whether or not it was read', () => {
    expect(noLimitsReason({ billing: 'api-key', source: null, readAt: null })).toBe('api-key');
    expect(noLimitsReason({ billing: 'api-key', source: 'usage-report', readAt: minutesFromNow(-3) })).toBe('api-key');
  });

  it('says a subscription account that was never read has no known limit yet', () => {
    expect(noLimitsReason({ billing: 'subscription', source: null, readAt: null })).toBe('never-read');
  });

  it('says a subscription account that was read and listed nothing reported none', () => {
    expect(noLimitsReason({ billing: 'subscription', source: 'usage-report', readAt: minutesFromNow(-3) })).toBe('none-reported');
  });
});
