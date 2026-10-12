import { dailyCapAmount } from '@agent-factory/domain';
import type { CommandBody, CostsView } from '../../contract/index.ts';
import type { DecimalNotation } from './decimal-notation.ts';
import { isDailyCap, isRunBudget } from './limits.ts';

export type BudgetSetting = Pick<CostsView, 'dailyCap' | 'perRunCapUsd'>;

export interface BudgetDraft {
  readonly dailyCap: string;
  readonly perRunCap: string;
}

export interface BudgetProblems {
  readonly dailyCap: boolean;
  readonly perRunCap: boolean;
}

/** What a cap field holds: nothing (no cap), an amount, or text that is neither. */
type CapEntry = { readonly kind: 'none' } | { readonly kind: 'amount'; readonly value: number } | { readonly kind: 'invalid' };

const NO_CAP: CapEntry = { kind: 'none' };
const INVALID_CAP: CapEntry = { kind: 'invalid' };

function capEntry(text: string, notation: DecimalNotation, accepts: (value: number | null) => value is number): CapEntry {
  if (text.trim() === '') return NO_CAP;
  const value = notation.parse(text);
  return accepts(value) ? { kind: 'amount', value } : INVALID_CAP;
}

export function budgetDraftOf(setting: BudgetSetting, notation: DecimalNotation): BudgetDraft {
  const daily = dailyCapAmount(setting.dailyCap);
  return {
    dailyCap: daily === null ? '' : notation.format(daily),
    perRunCap: setting.perRunCapUsd === null ? '' : notation.format(setting.perRunCapUsd),
  };
}

export function budgetProblems(draft: BudgetDraft, notation: DecimalNotation): BudgetProblems {
  return {
    dailyCap: capEntry(draft.dailyCap, notation, isDailyCap).kind === 'invalid',
    perRunCap: capEntry(draft.perRunCap, notation, isRunBudget).kind === 'invalid',
  };
}

function amountOf(entry: CapEntry): number | null {
  return entry.kind === 'amount' ? entry.value : null;
}

/** The change the factory takes: both caps, each an amount or null for no cap. Null while an entry is invalid. */
export function budgetChangeOf(draft: BudgetDraft, notation: DecimalNotation): CommandBody<'settings.update-budget'> | null {
  const daily = capEntry(draft.dailyCap, notation, isDailyCap);
  const perRun = capEntry(draft.perRunCap, notation, isRunBudget);
  if (daily.kind === 'invalid' || perRun.kind === 'invalid') return null;
  return { dailyCapUsd: amountOf(daily), perRunCapUsd: amountOf(perRun) };
}

export function isBudgetChanged(draft: BudgetDraft, setting: BudgetSetting, notation: DecimalNotation): boolean {
  const daily = capEntry(draft.dailyCap, notation, isDailyCap);
  const perRun = capEntry(draft.perRunCap, notation, isRunBudget);
  return daily.kind === 'invalid' || perRun.kind === 'invalid' || amountOf(daily) !== dailyCapAmount(setting.dailyCap) || amountOf(perRun) !== setting.perRunCapUsd;
}
