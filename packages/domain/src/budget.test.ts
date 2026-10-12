import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assessAccountBudget, assessDailySpend, chooseAccount, DEFAULT_BUDGET_THRESHOLDS, isSameUtcDay, REASON_NO_ACCOUNT, startOfNextUtcDay } from './budget.ts';
import type { RateLimitSnapshot } from './model.ts';

const NOW = new Date('2026-10-10T12:00:00Z');
const IN_ONE_HOUR = new Date('2026-10-10T13:00:00Z');
const IN_TWO_DAYS = new Date('2026-10-12T12:00:00Z');
const AN_HOUR_AGO = new Date('2026-10-10T11:00:00Z');

function snapshot(window: RateLimitSnapshot['window'], utilization: number, resetsAt: Date): RateLimitSnapshot {
  return { window, utilization, resetsAt };
}

describe('budget governor rules', () => {
  it('admits an account below both thresholds', () => {
    expect(
      assessAccountBudget([snapshot('five_hour', 0.89, IN_ONE_HOUR), snapshot('seven_day', 0.84, IN_TWO_DAYS)], DEFAULT_BUDGET_THRESHOLDS, NOW),
    ).toEqual({ admitted: true });
  });

  it('pauses at the seven-day threshold until its reset', () => {
    expect(assessAccountBudget([snapshot('seven_day', 0.85, IN_TWO_DAYS)], DEFAULT_BUDGET_THRESHOLDS, NOW)).toEqual({
      admitted: false,
      reason: 'seven_day window at 85% (pause at 85%)',
      resumesAt: IN_TWO_DAYS,
    });
  });

  it('pauses at the five-hour threshold and waits for the latest reset when both windows are spent', () => {
    const budget = assessAccountBudget(
      [snapshot('five_hour', 0.95, IN_ONE_HOUR), snapshot('seven_day', 0.9, IN_TWO_DAYS)],
      DEFAULT_BUDGET_THRESHOLDS,
      NOW,
    );
    expect(budget).toMatchObject({ admitted: false, resumesAt: IN_TWO_DAYS });
  });

  it('forgets a window whose reset time has passed', () => {
    expect(assessAccountBudget([snapshot('five_hour', 1, AN_HOUR_AGO)], DEFAULT_BUDGET_THRESHOLDS, NOW)).toEqual({ admitted: true });
  });

  it('selects the first account under the thresholds', () => {
    const choice = chooseAccount(
      [
        { account: 'primary', snapshots: [snapshot('five_hour', 0.97, IN_ONE_HOUR)] },
        { account: 'secondary', snapshots: [snapshot('seven_day', 0.2, IN_TWO_DAYS)] },
        { account: 'tertiary', snapshots: [] },
      ],
      DEFAULT_BUDGET_THRESHOLDS,
      NOW,
    );
    expect(choice).toEqual({ kind: 'selected', account: 'secondary' });
  });

  it('reports the earliest reset when every account is spent', () => {
    const choice = chooseAccount(
      [
        { account: 'primary', snapshots: [snapshot('seven_day', 0.9, IN_TWO_DAYS)] },
        { account: 'secondary', snapshots: [snapshot('five_hour', 0.91, IN_ONE_HOUR)] },
      ],
      DEFAULT_BUDGET_THRESHOLDS,
      NOW,
    );
    expect(choice).toEqual({
      kind: 'exhausted',
      reason: 'primary: seven_day window at 90% (pause at 85%); secondary: five_hour window at 91% (pause at 90%)',
      resumesAt: IN_ONE_HOUR,
    });
  });

  it('refuses when no account exists', () => {
    expect(chooseAccount([], DEFAULT_BUDGET_THRESHOLDS, NOW)).toEqual({ kind: 'exhausted', reason: REASON_NO_ACCOUNT, resumesAt: NOW });
  });

  it('never admits an account with an active window at or above its threshold', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 2, noNaN: true }), fc.double({ min: 0, max: 2, noNaN: true }), (fiveHour, sevenDay) => {
        const budget = assessAccountBudget(
          [snapshot('five_hour', fiveHour, IN_ONE_HOUR), snapshot('seven_day', sevenDay, IN_TWO_DAYS)],
          DEFAULT_BUDGET_THRESHOLDS,
          NOW,
        );
        const spent = fiveHour >= DEFAULT_BUDGET_THRESHOLDS.five_hour || sevenDay >= DEFAULT_BUDGET_THRESHOLDS.seven_day;
        return budget.admitted === !spent;
      }),
    );
  });

  it('pauses for the rest of the UTC day once the daily cap is spent', () => {
    expect(assessDailySpend(49.99, 50, NOW)).toEqual({ admitted: true });
    expect(assessDailySpend(1000, null, NOW)).toEqual({ admitted: true });
    expect(assessDailySpend(50, 50, NOW)).toEqual({
      admitted: false,
      reason: "today's agent spend $50.00 reached the daily cap $50.00",
      resumesAt: new Date('2026-10-11T00:00:00Z'),
    });
    expect(startOfNextUtcDay(new Date('2026-10-10T23:59:59Z'))).toEqual(new Date('2026-10-11T00:00:00Z'));
    expect(isSameUtcDay(new Date('2026-10-10T00:00:00Z'), new Date('2026-10-10T23:59:59Z'))).toBe(true);
    expect(isSameUtcDay(new Date('2026-10-10T23:59:59Z'), new Date('2026-10-11T00:00:00Z'))).toBe(false);
  });
});
