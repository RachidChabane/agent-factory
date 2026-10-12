import fc from 'fast-check';
import { dailyCapOfAmount, MAX_DAILY_CAP_USD, MAX_RUN_BUDGET_USD, settingsChangeProblems } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import type { BudgetDraft, BudgetSetting } from './budget-form.ts';
import { budgetChangeOf, budgetDraftOf, budgetProblems, isBudgetChanged } from './budget-form.ts';
import { decimalNotation } from './decimal-notation.ts';
import { FIXED_SEED } from './property-test-config.ts';

const notation = decimalNotation('en');
const NO_CAPS: BudgetSetting = { dailyCap: { kind: 'none' }, perRunCapUsd: null };
const CAPS: BudgetSetting = { dailyCap: { kind: 'usd', amount: 50 }, perRunCapUsd: 5 };
const withDraft = (patch: Partial<BudgetDraft>, base: BudgetSetting = NO_CAPS): BudgetDraft => ({ ...budgetDraftOf(base, notation), ...patch });

describe('budgetDraftOf', () => {
  it('shows an empty field for a cap that is not set', () => {
    expect(budgetDraftOf(NO_CAPS, notation)).toEqual({ dailyCap: '', perRunCap: '' });
  });

  it('shows the amounts the way the language writes them', () => {
    expect(budgetDraftOf({ dailyCap: { kind: 'usd', amount: 42.5 }, perRunCapUsd: 4.25 }, decimalNotation('fr'))).toEqual({ dailyCap: '42,5', perRunCap: '4,25' });
  });
});

describe('budgetChangeOf', () => {
  it('sends null for a field left empty: empty means no cap, never zero', () => {
    expect(budgetChangeOf(withDraft({}), notation)).toStrictEqual({ dailyCapUsd: null, perRunCapUsd: null });
    expect(budgetChangeOf(withDraft({ dailyCap: '   ' }), notation)).toStrictEqual({ dailyCapUsd: null, perRunCapUsd: null });
  });

  it('sends both caps, each an amount or null', () => {
    expect(budgetChangeOf(budgetDraftOf(CAPS, notation), notation)).toStrictEqual({ dailyCapUsd: 50, perRunCapUsd: 5 });
    expect(budgetChangeOf(withDraft({ dailyCap: '75.5' }), notation)).toStrictEqual({ dailyCapUsd: 75.5, perRunCapUsd: null });
    expect(budgetChangeOf(withDraft({ perRunCap: '2' }), notation)).toStrictEqual({ dailyCapUsd: null, perRunCapUsd: 2 });
  });

  it.each([
    ['a daily cap of zero', { dailyCap: '0' }],
    ['a daily cap above the ceiling', { dailyCap: String(MAX_DAILY_CAP_USD + 1) }],
    ['a daily cap that is not a number', { dailyCap: 'lots' }],
    ['a negative daily cap', { dailyCap: '-5' }],
    ['a per-run cap of zero', { perRunCap: '0' }],
    ['a per-run cap above the ceiling', { perRunCap: String(MAX_RUN_BUDGET_USD + 1) }],
    ['a per-run cap that is not a number', { perRunCap: '5 dollars' }],
    ['a comma where the language writes a point', { perRunCap: '2,5' }],
  ])('builds nothing for %s', (_, patch) => {
    expect(budgetChangeOf(withDraft(patch), notation)).toBeNull();
  });

  it('accepts the ceilings themselves', () => {
    expect(budgetChangeOf(withDraft({ dailyCap: String(MAX_DAILY_CAP_USD), perRunCap: String(MAX_RUN_BUDGET_USD) }), notation)).toStrictEqual({
      dailyCapUsd: MAX_DAILY_CAP_USD,
      perRunCapUsd: MAX_RUN_BUDGET_USD,
    });
  });
});

describe('budgetProblems', () => {
  it('names the field that is invalid and never blames an empty one', () => {
    expect(budgetProblems(withDraft({}), notation)).toEqual({ dailyCap: false, perRunCap: false });
    expect(budgetProblems(withDraft({ dailyCap: '0', perRunCap: '500' }), notation)).toEqual({ dailyCap: true, perRunCap: true });
  });
});

describe('isBudgetChanged', () => {
  it('is false for the caps the installation has, however they are written', () => {
    expect(isBudgetChanged(budgetDraftOf(CAPS, notation), CAPS, notation)).toBe(false);
    expect(isBudgetChanged(budgetDraftOf(NO_CAPS, notation), NO_CAPS, notation)).toBe(false);
    expect(isBudgetChanged(withDraft({ dailyCap: '50.0', perRunCap: ' 5 ' }, CAPS), CAPS, notation)).toBe(false);
  });

  it('is true when a cap is set, removed or changed', () => {
    expect(isBudgetChanged(withDraft({ dailyCap: '10' }), NO_CAPS, notation)).toBe(true);
    expect(isBudgetChanged(withDraft({ dailyCap: '' }, CAPS), CAPS, notation)).toBe(true);
    expect(isBudgetChanged(withDraft({ perRunCap: '' }, CAPS), CAPS, notation)).toBe(true);
    expect(isBudgetChanged(withDraft({ perRunCap: '6' }, CAPS), CAPS, notation)).toBe(true);
    expect(isBudgetChanged(withDraft({ dailyCap: 'x' }, CAPS), CAPS, notation)).toBe(true);
  });
});

const PLAIN_DECIMAL = fc
  .tuple(fc.nat({ max: 1_200 }), fc.option(fc.nat({ max: 999 }), { nil: null }))
  .map(([whole, fraction]) => (fraction === null ? String(whole) : `${whole}.${fraction}`));
const TEXT = fc.oneof(PLAIN_DECIMAL, fc.constantFrom('', '0', '0.0', '100', '100.01', '1000', '1000.01'), fc.string());

describe('budgetChangeOf against the bounds the factory enforces', () => {
  it('never builds a change the factory would refuse', () => {
    fc.assert(
      fc.property(TEXT, TEXT, (dailyCap, perRunCap) => {
        const change = budgetChangeOf({ dailyCap, perRunCap }, notation);
        return change === null || settingsChangeProblems({ kind: 'budget', dailyCap: dailyCapOfAmount(change.dailyCapUsd), perRunCapUsd: change.perRunCapUsd }).length === 0;
      }),
      { seed: FIXED_SEED },
    );
  });

  it('accepts a daily cap exactly when the factory does', () => {
    fc.assert(
      fc.property(PLAIN_DECIMAL, (text) => {
        const accepted = budgetChangeOf(withDraft({ dailyCap: text }), notation) !== null;
        return accepted === (settingsChangeProblems({ kind: 'budget', dailyCap: { kind: 'usd', amount: Number(text) }, perRunCapUsd: null }).length === 0);
      }),
      { seed: FIXED_SEED },
    );
  });

  it('accepts a per-run cap exactly when the factory does', () => {
    fc.assert(
      fc.property(PLAIN_DECIMAL, (text) => {
        const accepted = budgetChangeOf(withDraft({ perRunCap: text }), notation) !== null;
        return accepted === (settingsChangeProblems({ kind: 'budget', dailyCap: { kind: 'none' }, perRunCapUsd: Number(text) }).length === 0);
      }),
      { seed: FIXED_SEED },
    );
  });
});
