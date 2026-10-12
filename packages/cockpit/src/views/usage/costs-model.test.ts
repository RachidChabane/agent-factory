import { describe, expect, it } from 'vitest';
import type { DailyCost } from '../../contract/index.ts';
import { axisDates, byCostDescending, dailyCapAmount, endsOnDay, roleOfKey, shareOfLargest, summarizeDaily } from './costs-model.ts';

const NO_TOKENS = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, withoutCache: 0, withCache: 0 };
const day = (date: string, costUsd: number, runs: number): DailyCost => ({ date, costUsd, runs, tokens: NO_TOKENS });

describe('summarizeDaily', () => {
  it('totals the cost and the runs and averages the cost over every day of the period', () => {
    const summary = summarizeDaily([day('2026-10-10', 4, 2), day('2026-10-11', 0, 0), day('2026-10-12', 2, 1)]);
    expect(summary).toEqual({ totalUsd: 6, averageUsd: 2, runs: 3 });
  });

  it('summarizes an empty period as nothing', () => {
    expect(summarizeDaily([])).toEqual({ totalUsd: 0, averageUsd: 0, runs: 0 });
  });
});

describe('axisDates', () => {
  const days = Array.from({ length: 14 }, (_, index) => day(`2026-09-${String(index + 1).padStart(2, '0')}`, 1, 1));

  it('labels the first, the middle and the last day', () => {
    expect(axisDates(days)).toEqual(['2026-09-01', '2026-09-07', '2026-09-14']);
  });

  it('labels each day once on a short period', () => {
    expect(axisDates(days.slice(0, 2))).toEqual(['2026-09-01', '2026-09-02']);
    expect(axisDates(days.slice(0, 1))).toEqual(['2026-09-01']);
    expect(axisDates([])).toEqual([]);
  });
});

describe('endsOnDay', () => {
  it('holds when the last bar is the given day', () => {
    expect(endsOnDay([day('2026-10-11', 1, 1), day('2026-10-12', 1, 1)], '2026-10-12')).toBe(true);
    expect(endsOnDay([day('2026-10-11', 1, 1)], '2026-10-12')).toBe(false);
    expect(endsOnDay([], '2026-10-12')).toBe(false);
  });
});

describe('dailyCapAmount', () => {
  it('gives the amount of a cap and nothing when there is none', () => {
    expect(dailyCapAmount({ kind: 'usd', amount: 60 })).toBe(60);
    expect(dailyCapAmount({ kind: 'none' })).toBeNull();
  });
});

describe('roleOfKey', () => {
  it('recognizes the keys that are roles and no others', () => {
    expect(roleOfKey('implementer')).toBe('implementer');
    expect(roleOfKey('release-auditor')).toBe('release-auditor');
    expect(roleOfKey('storefront')).toBeNull();
  });
});

describe('byCostDescending and shareOfLargest', () => {
  const entries = [{ costUsd: 2 }, { costUsd: 8 }, { costUsd: 4 }];

  it('puts the most expensive entry first without touching the input', () => {
    expect(byCostDescending(entries).map((entry) => entry.costUsd)).toEqual([8, 4, 2]);
    expect(entries.map((entry) => entry.costUsd)).toEqual([2, 8, 4]);
  });

  it('measures each entry against the most expensive one', () => {
    expect(shareOfLargest(8, entries)).toBe(1);
    expect(shareOfLargest(2, entries)).toBe(0.25);
  });

  it('gives no length to a group that cost nothing', () => {
    expect(shareOfLargest(0, [{ costUsd: 0 }])).toBe(0);
    expect(shareOfLargest(0, [])).toBe(0);
  });
});
