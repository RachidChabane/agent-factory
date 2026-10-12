import fc from 'fast-check';
import { settingsChangeProblems } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import { concurrencyChangeOf, concurrencyDraftOf, concurrencyProblems, isConcurrencyChanged } from './concurrency-form.ts';
import { decimalNotation } from './decimal-notation.ts';
import { FIXED_SEED } from './property-test-config.ts';

const notation = decimalNotation('en');
const SETTING = { issues: 2, ceiling: 3 };
const DRAFT = concurrencyDraftOf(SETTING, notation);

describe('concurrencyChangeOf', () => {
  it('addresses the project and carries both numbers', () => {
    expect(concurrencyChangeOf('storefront', DRAFT, notation)).toStrictEqual({ project: 'storefront', issues: 2, ceiling: 3 });
    expect(concurrencyChangeOf('ledger', { issues: ' 1 ', ceiling: '1' }, notation)).toStrictEqual({ project: 'ledger', issues: 1, ceiling: 1 });
  });

  it.each([
    ['no issues', { issues: '', ceiling: '3' }],
    ['zero issues', { issues: '0', ceiling: '3' }],
    ['a fraction of an issue', { issues: '1.5', ceiling: '3' }],
    ['a ceiling below the issues', { issues: '3', ceiling: '2' }],
    ['no ceiling', { issues: '1', ceiling: '' }],
    ['a ceiling of zero', { issues: '1', ceiling: '0' }],
    ['a ceiling that is not a number', { issues: '1', ceiling: 'many' }],
  ])('builds nothing for %s', (_, draft) => {
    expect(concurrencyChangeOf('storefront', draft, notation)).toBeNull();
  });
});

describe('concurrencyProblems', () => {
  it('has none for a valid draft', () => {
    expect(concurrencyProblems(DRAFT, notation)).toEqual({ issues: false, ceiling: null });
  });

  it('tells a ceiling that is not a number from one that is below the issues', () => {
    expect(concurrencyProblems({ issues: '3', ceiling: '2' }, notation)).toEqual({ issues: false, ceiling: 'below-issues' });
    expect(concurrencyProblems({ issues: '3', ceiling: 'x' }, notation)).toEqual({ issues: false, ceiling: 'invalid' });
    expect(concurrencyProblems({ issues: '0', ceiling: '0' }, notation)).toEqual({ issues: true, ceiling: 'invalid' });
  });

  it('does not blame the ceiling for the issues being unreadable', () => {
    expect(concurrencyProblems({ issues: 'x', ceiling: '4' }, notation)).toEqual({ issues: true, ceiling: null });
  });
});

describe('isConcurrencyChanged', () => {
  it('compares the numbers, not their text', () => {
    expect(isConcurrencyChanged(DRAFT, SETTING, notation)).toBe(false);
    expect(isConcurrencyChanged({ issues: ' 2 ', ceiling: '3' }, SETTING, notation)).toBe(false);
    expect(isConcurrencyChanged({ issues: '1', ceiling: '3' }, SETTING, notation)).toBe(true);
    expect(isConcurrencyChanged({ issues: '2', ceiling: '4' }, SETTING, notation)).toBe(true);
    expect(isConcurrencyChanged({ issues: '2', ceiling: '' }, SETTING, notation)).toBe(true);
  });
});

const TEXT = fc.oneof(fc.nat({ max: 20 }).map(String), fc.constantFrom('0', '1', '2.5', '', ' ', '-1', 'x'), fc.string());

describe('concurrencyChangeOf against the bounds the factory enforces', () => {
  it('never builds a change the factory would refuse', () => {
    fc.assert(
      fc.property(TEXT, TEXT, (issues, ceiling) => {
        const change = concurrencyChangeOf('storefront', { issues, ceiling }, notation);
        return change === null || settingsChangeProblems({ kind: 'concurrency', ...change }).length === 0;
      }),
      { seed: FIXED_SEED },
    );
  });

  it('accepts whole numbers exactly when the factory does', () => {
    fc.assert(
      fc.property(fc.nat({ max: 20 }), fc.nat({ max: 20 }), (issues, ceiling) => {
        const accepted = concurrencyChangeOf('storefront', { issues: String(issues), ceiling: String(ceiling) }, notation) !== null;
        return accepted === (settingsChangeProblems({ kind: 'concurrency', project: 'storefront', issues, ceiling }).length === 0);
      }),
      { seed: FIXED_SEED },
    );
  });
});
