import { MAX_DAILY_CAP_USD, MAX_RUN_BUDGET_USD } from '@agent-factory/domain';

/** Whether a parsed entry lies in the closed range; an entry that did not parse never does. */
export function isWithin(value: number | null, minimum: number, maximum: number): value is number {
  return value !== null && value >= minimum && value <= maximum;
}

/** The budget of one agent run, whether set for a role or as the per-run cap: above zero, at most the domain's ceiling. */
export function isRunBudget(value: number | null): value is number {
  return value !== null && value > 0 && value <= MAX_RUN_BUDGET_USD;
}

/** A daily spending cap: above zero (zero is never a cap), at most the domain's ceiling. */
export function isDailyCap(value: number | null): value is number {
  return value !== null && value > 0 && value <= MAX_DAILY_CAP_USD;
}
