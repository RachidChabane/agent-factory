import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assessDailySpend, dailyCapAmount, dailyCapOfAmount, isSameUtcDay, NO_DAILY_CAP, startOfNextUtcDay } from './budget.ts';

const NOW = new Date('2026-10-10T12:00:00Z');

describe('daily spending cap', () => {
  it('pauses for the rest of the UTC day once the daily cap is spent', () => {
    expect(assessDailySpend(49.99, 50, NOW)).toEqual({ admitted: true });
    expect(assessDailySpend(1000, null, NOW)).toEqual({ admitted: true });
    expect(assessDailySpend(50, 50, NOW)).toEqual({
      admitted: false,
      reason: "today's agent spend $50.00 reached the daily cap $50.00",
      resumesAt: new Date('2026-10-11T00:00:00Z'),
    });
  });

  it('tells UTC days apart', () => {
    expect(startOfNextUtcDay(new Date('2026-10-10T23:59:59Z'))).toEqual(new Date('2026-10-11T00:00:00Z'));
    expect(isSameUtcDay(new Date('2026-10-10T00:00:00Z'), new Date('2026-10-10T23:59:59Z'))).toBe(true);
    expect(isSameUtcDay(new Date('2026-10-10T23:59:59Z'), new Date('2026-10-11T00:00:00Z'))).toBe(false);
  });

  it('keeps "no cap" and an amount apart, so a cap is never zero by accident', () => {
    expect(dailyCapAmount(NO_DAILY_CAP)).toBeNull();
    expect(dailyCapOfAmount(null)).toEqual(NO_DAILY_CAP);
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 1_000, noNaN: true }), (amount) => {
        expect(dailyCapAmount(dailyCapOfAmount(amount))).toBe(amount);
      }),
    );
  });
});
