export const REASON_NO_ACCOUNT = 'no Claude account is configured';

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

/** A daily spending cap is either absent or a positive amount; zero is never a cap. */
export type DailyCap = { readonly kind: 'none' } | { readonly kind: 'usd'; readonly amount: number };

export const NO_DAILY_CAP: DailyCap = { kind: 'none' };

export function dailyCapAmount(cap: DailyCap): number | null {
  return cap.kind === 'none' ? null : cap.amount;
}

export function dailyCapOfAmount(amount: number | null): DailyCap {
  return amount === null ? NO_DAILY_CAP : { kind: 'usd', amount };
}
