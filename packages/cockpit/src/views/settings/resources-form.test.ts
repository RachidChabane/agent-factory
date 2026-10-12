import fc from 'fast-check';
import { MAX_CONCURRENT_RUNS, MAX_FREE_MEMORY_THRESHOLD_PERCENT, MIN_FREE_MEMORY_THRESHOLD_PERCENT, PAUSE_ABOVE_PRESSURE_LEVELS, settingsChangeProblems } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import { decimalNotation } from './decimal-notation.ts';
import type { ResourcesDraft } from './resources-form.ts';
import { isPauseAbovePressure, isResourcesChanged, resourcesChangeOf, resourcesDraftOf, resourcesProblems } from './resources-form.ts';
import { FIXED_SEED } from './property-test-config.ts';

const notation = decimalNotation('en');
const SETTING = { minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal', maxConcurrentRuns: 3 } as const;
const DRAFT = resourcesDraftOf(SETTING, notation);
const withDraft = (patch: Partial<ResourcesDraft>): ResourcesDraft => ({ ...DRAFT, ...patch });

describe('isPauseAbovePressure', () => {
  it('accepts the two levels the factory pauses above, and not critical', () => {
    expect(PAUSE_ABOVE_PRESSURE_LEVELS).toEqual(['normal', 'warn']);
    expect(isPauseAbovePressure('normal')).toBe(true);
    expect(isPauseAbovePressure('warn')).toBe(true);
    expect(isPauseAbovePressure('critical')).toBe(false);
    expect(isPauseAbovePressure('')).toBe(false);
  });
});

describe('resourcesDraftOf', () => {
  it('shows the numbers the way the language writes them', () => {
    expect(resourcesDraftOf({ ...SETTING, minimumFreeMemoryPercent: 42.5 }, decimalNotation('fr'))).toEqual({ minimumFreeMemory: '42,5', pauseAbovePressure: 'normal', maxConcurrentRuns: '3' });
  });

  it('keeps the level the installation holds', () => {
    expect(resourcesDraftOf({ ...SETTING, pauseAbovePressure: 'warn' }, notation).pauseAbovePressure).toBe('warn');
  });
});

describe('resourcesChangeOf', () => {
  it('carries the three fields of the command', () => {
    expect(resourcesChangeOf(DRAFT, notation)).toStrictEqual({ minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal', maxConcurrentRuns: 3 });
    expect(resourcesChangeOf(withDraft({ minimumFreeMemory: '42.5', pauseAbovePressure: 'warn', maxConcurrentRuns: '16' }), notation)).toStrictEqual({
      minimumFreeMemoryPercent: 42.5,
      pauseAbovePressure: 'warn',
      maxConcurrentRuns: 16,
    });
  });

  it.each([
    ['a threshold below the bound', { minimumFreeMemory: String(MIN_FREE_MEMORY_THRESHOLD_PERCENT - 1) }],
    ['a threshold above the bound', { minimumFreeMemory: String(MAX_FREE_MEMORY_THRESHOLD_PERCENT + 1) }],
    ['no threshold', { minimumFreeMemory: '' }],
    ['a threshold that is not a number', { minimumFreeMemory: 'half' }],
    ['no runs', { maxConcurrentRuns: '0' }],
    ['more runs than the factory allows', { maxConcurrentRuns: String(MAX_CONCURRENT_RUNS + 1) }],
    ['a fraction of a run', { maxConcurrentRuns: '1.5' }],
    ['an empty number of runs', { maxConcurrentRuns: '' }],
  ])('builds nothing for %s', (_, patch) => {
    expect(resourcesChangeOf(withDraft(patch), notation)).toBeNull();
  });

  it('accepts the bounds themselves', () => {
    expect(resourcesChangeOf(withDraft({ minimumFreeMemory: '10', maxConcurrentRuns: '1' }), notation)).not.toBeNull();
    expect(resourcesChangeOf(withDraft({ minimumFreeMemory: '90', maxConcurrentRuns: String(MAX_CONCURRENT_RUNS) }), notation)).not.toBeNull();
  });
});

describe('resourcesProblems', () => {
  it('names the fields that are invalid', () => {
    expect(resourcesProblems(DRAFT, notation)).toEqual({ minimumFreeMemory: false, maxConcurrentRuns: false });
    expect(resourcesProblems(withDraft({ minimumFreeMemory: '5', maxConcurrentRuns: '99' }), notation)).toEqual({ minimumFreeMemory: true, maxConcurrentRuns: true });
  });
});

describe('isResourcesChanged', () => {
  it('compares the values, not their text', () => {
    expect(isResourcesChanged(DRAFT, SETTING, notation)).toBe(false);
    expect(isResourcesChanged(withDraft({ minimumFreeMemory: '40.0' }), SETTING, notation)).toBe(false);
    expect(isResourcesChanged(withDraft({ minimumFreeMemory: '41' }), SETTING, notation)).toBe(true);
    expect(isResourcesChanged(withDraft({ pauseAbovePressure: 'warn' }), SETTING, notation)).toBe(true);
    expect(isResourcesChanged(withDraft({ maxConcurrentRuns: '4' }), SETTING, notation)).toBe(true);
  });
});

const PLAIN_DECIMAL = fc
  .tuple(fc.nat({ max: 120 }), fc.option(fc.nat({ max: 999 }), { nil: null }))
  .map(([whole, fraction]) => (fraction === null ? String(whole) : `${whole}.${fraction}`));
const TEXT = fc.oneof(PLAIN_DECIMAL, fc.constantFrom('9.99', '10', '10.0', '90', '90.01', '16', '17', '0', ''), fc.string());

describe('resourcesChangeOf against the bounds the factory enforces', () => {
  it('never builds a change the factory would refuse', () => {
    fc.assert(
      fc.property(TEXT, TEXT, fc.constantFrom(...PAUSE_ABOVE_PRESSURE_LEVELS), (threshold, runs, pressure) => {
        const change = resourcesChangeOf({ minimumFreeMemory: threshold, pauseAbovePressure: pressure, maxConcurrentRuns: runs }, notation);
        return change === null || settingsChangeProblems({ kind: 'resources', ...change }).length === 0;
      }),
      { seed: FIXED_SEED },
    );
  });

  it('accepts a threshold exactly when the factory does', () => {
    fc.assert(
      fc.property(PLAIN_DECIMAL, (threshold) => {
        const accepted = resourcesChangeOf(withDraft({ minimumFreeMemory: threshold }), notation) !== null;
        return accepted === (settingsChangeProblems({ kind: 'resources', minimumFreeMemoryPercent: Number(threshold), pauseAbovePressure: 'normal', maxConcurrentRuns: 3 }).length === 0);
      }),
      { seed: FIXED_SEED },
    );
  });

  it('accepts a number of runs exactly when the factory does', () => {
    fc.assert(
      fc.property(PLAIN_DECIMAL, (runs) => {
        const accepted = resourcesChangeOf(withDraft({ maxConcurrentRuns: runs }), notation) !== null;
        return accepted === (settingsChangeProblems({ kind: 'resources', minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal', maxConcurrentRuns: Number(runs) }).length === 0);
      }),
      { seed: FIXED_SEED },
    );
  });
});
