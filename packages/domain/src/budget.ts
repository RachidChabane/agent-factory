import type { RateLimitSnapshot, RateLimitWindow } from './model.ts';

export const DEFAULT_FIVE_HOUR_PAUSE_UTILIZATION = 0.9;
export const DEFAULT_SEVEN_DAY_PAUSE_UTILIZATION = 0.85;

export type BudgetThresholds = Readonly<Record<RateLimitWindow, number>>;

export const DEFAULT_BUDGET_THRESHOLDS: BudgetThresholds = {
  five_hour: DEFAULT_FIVE_HOUR_PAUSE_UTILIZATION,
  seven_day: DEFAULT_SEVEN_DAY_PAUSE_UTILIZATION,
};

export interface AccountStanding {
  readonly account: string;
  readonly snapshots: readonly RateLimitSnapshot[];
}

export type AccountBudget =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly reason: string; readonly resumesAt: Date };

export type AccountChoice =
  | { readonly kind: 'selected'; readonly account: string }
  | { readonly kind: 'exhausted'; readonly reason: string; readonly resumesAt: Date };

export const REASON_NO_ACCOUNT = 'no Claude account is configured';
const PERCENT = 100;

function percent(ratio: number): string {
  return `${Math.round(ratio * PERCENT)}%`;
}

function isActive(snapshot: RateLimitSnapshot, now: Date): boolean {
  return snapshot.resetsAt.getTime() > now.getTime();
}

export function assessAccountBudget(
  snapshots: readonly RateLimitSnapshot[],
  thresholds: BudgetThresholds,
  now: Date,
): AccountBudget {
  const exceeded = snapshots.filter((snapshot) => isActive(snapshot, now) && snapshot.utilization >= thresholds[snapshot.window]);
  if (exceeded.length === 0) return { admitted: true };
  const resumesAt = new Date(Math.max(...exceeded.map((snapshot) => snapshot.resetsAt.getTime())));
  const reason = exceeded
    .map((snapshot) => `${snapshot.window} window at ${percent(snapshot.utilization)} (pause at ${percent(thresholds[snapshot.window])})`)
    .join(', ');
  return { admitted: false, reason, resumesAt };
}

export function chooseAccount(accounts: readonly AccountStanding[], thresholds: BudgetThresholds, now: Date): AccountChoice {
  const refusals: { readonly account: string; readonly reason: string; readonly resumesAt: Date }[] = [];
  for (const standing of accounts) {
    const budget = assessAccountBudget(standing.snapshots, thresholds, now);
    if (budget.admitted) return { kind: 'selected', account: standing.account };
    refusals.push({ account: standing.account, reason: budget.reason, resumesAt: budget.resumesAt });
  }
  if (refusals.length === 0) return { kind: 'exhausted', reason: REASON_NO_ACCOUNT, resumesAt: now };
  const resumesAt = new Date(Math.min(...refusals.map((refusal) => refusal.resumesAt.getTime())));
  const reason = refusals.map((refusal) => `${refusal.account}: ${refusal.reason}`).join('; ');
  return { kind: 'exhausted', reason, resumesAt };
}

export type DailySpendBudget =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly reason: string; readonly resumesAt: Date };

const DAY_MS = 86_400_000;
const CENT_DECIMALS = 2;

export function startOfNextUtcDay(now: Date): Date {
  return new Date((Math.floor(now.getTime() / DAY_MS) + 1) * DAY_MS);
}

export function isSameUtcDay(left: Date, right: Date): boolean {
  return Math.floor(left.getTime() / DAY_MS) === Math.floor(right.getTime() / DAY_MS);
}

export function assessDailySpend(spentUsd: number, capUsd: number | null, now: Date): DailySpendBudget {
  if (capUsd === null || spentUsd < capUsd) return { admitted: true };
  return {
    admitted: false,
    reason: `today's agent spend $${spentUsd.toFixed(CENT_DECIMALS)} reached the daily cap $${capUsd.toFixed(CENT_DECIMALS)}`,
    resumesAt: startOfNextUtcDay(now),
  };
}
