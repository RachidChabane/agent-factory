import fc from 'fast-check';
import { MAX_ROLE_TURNS, MAX_RUN_BUDGET_USD, settingsChangeProblems } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import type { RoleSetting } from '../../contract/index.ts';
import { decimalNotation } from './decimal-notation.ts';
import type { RoleDraft } from './role-form.ts';
import { isRoleChanged, modelOptions, roleChangeOf, roleDraftOf, roleProblems } from './role-form.ts';
import { FIXED_SEED } from './property-test-config.ts';

const notation = decimalNotation('en');
const IMPLEMENTER: RoleSetting = { role: 'implementer', model: 'claude-sonnet-5-5', effort: 'high', maxBudgetUsd: 5, maxTurns: 150, timeoutMinutes: 60 };
const DRAFT = roleDraftOf(IMPLEMENTER, notation);

const withDraft = (patch: Partial<RoleDraft>): RoleDraft => ({ ...DRAFT, ...patch });

describe('roleDraftOf', () => {
  it('shows the numbers the way the active language writes them', () => {
    expect(roleDraftOf({ ...IMPLEMENTER, maxBudgetUsd: 4.5 }, decimalNotation('fr'))).toEqual({ model: 'claude-sonnet-5-5', effort: 'high', maxBudget: '4,5', maxTurns: '150' });
  });
});

describe('roleChangeOf', () => {
  it('builds the change field by field, without the read-only timeout', () => {
    expect(roleChangeOf('implementer', DRAFT, notation)).toStrictEqual({ role: 'implementer', model: 'claude-sonnet-5-5', effort: 'high', maxBudgetUsd: 5, maxTurns: 150 });
  });

  it('reads what the operator typed', () => {
    expect(roleChangeOf('reviewer', withDraft({ model: 'claude-opus-5-5', effort: 'xhigh', maxBudget: ' 7.5 ', maxTurns: '80' }), notation)).toStrictEqual({
      role: 'reviewer',
      model: 'claude-opus-5-5',
      effort: 'xhigh',
      maxBudgetUsd: 7.5,
      maxTurns: 80,
    });
  });

  it('reads a comma as the decimal mark in French only', () => {
    expect(roleChangeOf('reviewer', withDraft({ maxBudget: '4,5' }), decimalNotation('fr'))?.maxBudgetUsd).toBe(4.5);
    expect(roleChangeOf('reviewer', withDraft({ maxBudget: '4,5' }), notation)).toBeNull();
  });

  it.each([
    ['an empty budget', { maxBudget: '' }],
    ['a budget of zero', { maxBudget: '0' }],
    ['a budget above the ceiling', { maxBudget: String(MAX_RUN_BUDGET_USD + 0.01) }],
    ['a budget that is not a number', { maxBudget: 'a lot' }],
    ['a negative budget', { maxBudget: '-3' }],
    ['no turns', { maxTurns: '' }],
    ['zero turns', { maxTurns: '0' }],
    ['more turns than allowed', { maxTurns: String(MAX_ROLE_TURNS + 1) }],
    ['a fraction of a turn', { maxTurns: '2.5' }],
    ['an empty model', { model: '' }],
    ['a model that is not a model name', { model: 'sonnet; rm -rf /' }],
  ] as const)('builds nothing for %s', (_, patch) => {
    expect(roleChangeOf('implementer', withDraft(patch), notation)).toBeNull();
  });

  it('accepts the bounds themselves', () => {
    expect(roleChangeOf('implementer', withDraft({ maxBudget: String(MAX_RUN_BUDGET_USD), maxTurns: String(MAX_ROLE_TURNS) }), notation)).not.toBeNull();
    expect(roleChangeOf('implementer', withDraft({ maxBudget: '0.01', maxTurns: '1' }), notation)).not.toBeNull();
  });
});

describe('roleProblems', () => {
  it('names the fields that are invalid', () => {
    expect(roleProblems(DRAFT, notation)).toEqual({ model: false, maxBudget: false, maxTurns: false });
    expect(roleProblems(withDraft({ maxBudget: '0', maxTurns: '0', model: ' ' }), notation)).toEqual({ model: true, maxBudget: true, maxTurns: true });
  });
});

describe('isRoleChanged', () => {
  it('is false for the values the role has, however they are written', () => {
    expect(isRoleChanged(DRAFT, IMPLEMENTER, notation)).toBe(false);
    expect(isRoleChanged(withDraft({ maxBudget: '5.0', maxTurns: ' 150 ' }), IMPLEMENTER, notation)).toBe(false);
  });

  it.each([
    ['the model', { model: 'claude-opus-5-5' }],
    ['the effort', { effort: 'low' }],
    ['the budget', { maxBudget: '6' }],
    ['the turns', { maxTurns: '151' }],
    ['the budget into something invalid', { maxBudget: 'x' }],
  ] as const)('is true once %s changes', (_, patch) => {
    expect(isRoleChanged(withDraft(patch), IMPLEMENTER, notation)).toBe(true);
  });
});

describe('modelOptions', () => {
  it('lists the models of the installation', () => {
    expect(modelOptions(['a', 'b'], 'b')).toEqual(['a', 'b']);
  });

  it('keeps the model the role has even when the installation does not list it', () => {
    expect(modelOptions(['a', 'b'], 'retired')).toEqual(['retired', 'a', 'b']);
  });
});

const PLAIN_DECIMAL = fc
  .tuple(fc.nat({ max: 1_500 }), fc.option(fc.nat({ max: 999 }), { nil: null }))
  .map(([whole, fraction]) => (fraction === null ? String(whole) : `${whole}.${fraction}`));
const BOUNDARY_TEXTS = fc.constantFrom('0', '0.0', '0.01', '1', '100', '100.0', '100.01', '500', '501', '1000', '1000.5');
const TEXT = fc.oneof(PLAIN_DECIMAL, BOUNDARY_TEXTS, fc.string());

describe('roleChangeOf against the bounds the factory enforces', () => {
  const domainProblems = (change: NonNullable<ReturnType<typeof roleChangeOf>>) => settingsChangeProblems({ kind: 'role', project: null, ...change });

  it('never builds a change the factory would refuse', () => {
    fc.assert(
      fc.property(TEXT, TEXT, (budget, turns) => {
        const change = roleChangeOf('implementer', withDraft({ maxBudget: budget, maxTurns: turns }), notation);
        return change === null || domainProblems(change).length === 0;
      }),
      { seed: FIXED_SEED },
    );
  });

  it('accepts a budget exactly when the factory does', () => {
    fc.assert(
      fc.property(PLAIN_DECIMAL, (budget) => {
        const accepted = roleChangeOf('implementer', withDraft({ maxBudget: budget }), notation) !== null;
        const domainAccepts = settingsChangeProblems({ kind: 'role', project: null, role: 'implementer', model: DRAFT.model, effort: 'high', maxBudgetUsd: Number(budget), maxTurns: 150 }).length === 0;
        return accepted === domainAccepts;
      }),
      { seed: FIXED_SEED },
    );
  });

  it('accepts a number of turns exactly when the factory does', () => {
    fc.assert(
      fc.property(PLAIN_DECIMAL, (turns) => {
        const accepted = roleChangeOf('implementer', withDraft({ maxTurns: turns }), notation) !== null;
        const domainAccepts = settingsChangeProblems({ kind: 'role', project: null, role: 'implementer', model: DRAFT.model, effort: 'high', maxBudgetUsd: 5, maxTurns: Number(turns) }).length === 0;
        return accepted === domainAccepts;
      }),
      { seed: FIXED_SEED },
    );
  });
});
