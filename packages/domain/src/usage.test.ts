import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assessUsage,
  DEFAULT_USAGE_THRESHOLDS,
  freshnessOf,
  latestLimits,
  needsRefresh,
  utilizationFromPercent,
  type UsageReading,
} from './usage.ts';

const NOW = new Date('2026-03-02T10:00:00.000Z');
const STALE_AFTER_MS = 30 * 60_000;
const HOUR_MS = 3_600_000;

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs);
}

function reading(overrides: Partial<UsageReading> = {}): UsageReading {
  return {
    account: 'primary',
    source: 'usage-report',
    readAt: at(-5 * 60_000),
    limits: [
      { kind: 'session', scope: null, utilization: 0.4, resetsAt: at(2 * HOUR_MS) },
      { kind: 'weekly_all', scope: null, utilization: 0.2, resetsAt: at(72 * HOUR_MS) },
      { kind: 'weekly_scoped', scope: 'Opus', utilization: 0.1, resetsAt: at(72 * HOUR_MS) },
    ],
    ...overrides,
  };
}

describe('freshnessOf', () => {
  it('calls a recent reading of a running window fresh', () => {
    expect(freshnessOf({ kind: 'session', scope: null, utilization: 0.5, resetsAt: at(HOUR_MS) }, at(-60_000), NOW, STALE_AFTER_MS)).toBe('fresh');
  });

  it('calls an old reading of a running window stale', () => {
    expect(freshnessOf({ kind: 'session', scope: null, utilization: 0.5, resetsAt: at(HOUR_MS) }, at(-2 * HOUR_MS), NOW, STALE_AFTER_MS)).toBe('stale');
  });

  it('says the window reset when its reset time has passed, however recent the reading', () => {
    expect(freshnessOf({ kind: 'session', scope: null, utilization: 0.97, resetsAt: at(-60_000) }, at(-120_000), NOW, STALE_AFTER_MS)).toBe('window-reset');
  });
});

describe('latestLimits', () => {
  it('keeps the latest reading of each kind and scope, with its source and read time', () => {
    const older = reading({ readAt: at(-HOUR_MS), source: 'agent-stream' });
    const newer = reading({ readAt: at(-60_000), limits: [{ kind: 'session', scope: null, utilization: 0.6, resetsAt: at(HOUR_MS) }] });
    const limits = latestLimits([newer, older], NOW, STALE_AFTER_MS);
    expect(limits.map((limit) => [limit.kind, limit.scope, limit.utilization, limit.source])).toEqual([
      ['session', null, 0.6, 'usage-report'],
      ['weekly_all', null, 0.2, 'agent-stream'],
      ['weekly_scoped', 'Opus', 0.1, 'agent-stream'],
    ]);
    expect(limits[1]?.freshness).toBe('stale');
  });

  it('keeps one entry per scope of the scoped weekly limit', () => {
    const scoped = reading({
      limits: [
        { kind: 'weekly_scoped', scope: 'Opus', utilization: 0.3, resetsAt: at(HOUR_MS) },
        { kind: 'weekly_scoped', scope: 'Sonnet', utilization: 0.1, resetsAt: at(HOUR_MS) },
      ],
    });
    expect(latestLimits([scoped], NOW, STALE_AFTER_MS).map((limit) => limit.scope)).toEqual(['Opus', 'Sonnet']);
  });
});

describe('assessUsage', () => {
  it('admits an account below every threshold', () => {
    expect(assessUsage(latestLimits([reading()], NOW, STALE_AFTER_MS), DEFAULT_USAGE_THRESHOLDS, NOW)).toEqual({ admitted: true });
  });

  it('refuses an account whose session window is at its threshold, until that window resets', () => {
    const full = reading({ limits: [{ kind: 'session', scope: null, utilization: 0.9, resetsAt: at(HOUR_MS) }] });
    expect(assessUsage(latestLimits([full], NOW, STALE_AFTER_MS), DEFAULT_USAGE_THRESHOLDS, NOW)).toEqual({
      admitted: false,
      reason: 'session at 90% (pause at 90%)',
      resumesAt: at(HOUR_MS),
    });
  });

  it('ignores a full window that has reset since it was read', () => {
    const reset = reading({ limits: [{ kind: 'weekly_all', scope: null, utilization: 0.99, resetsAt: at(-60_000) }] });
    expect(assessUsage(latestLimits([reset], NOW, STALE_AFTER_MS), DEFAULT_USAGE_THRESHOLDS, NOW)).toEqual({ admitted: true });
  });

  it('names the model of a scoped weekly limit in the reason', () => {
    const scoped = reading({ limits: [{ kind: 'weekly_scoped', scope: 'Opus', utilization: 0.95, resetsAt: at(2 * HOUR_MS) }] });
    const admission = assessUsage(latestLimits([scoped], NOW, STALE_AFTER_MS), DEFAULT_USAGE_THRESHOLDS, NOW);
    expect(admission.admitted ? null : admission.reason).toBe('weekly_scoped (Opus) at 95% (pause at 85%)');
  });

  it('resumes at the latest reset among the exceeded windows', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 1, maxLength: 5 }), (hours) => {
        const limits = latestLimits(
          [reading({ limits: hours.map((hour, index) => ({ kind: 'weekly_scoped' as const, scope: `model-${index}`, utilization: 1, resetsAt: at(hour * HOUR_MS) })) })],
          NOW,
          STALE_AFTER_MS,
        );
        const admission = assessUsage(limits, DEFAULT_USAGE_THRESHOLDS, NOW);
        expect(admission.admitted ? null : admission.resumesAt.getTime()).toBe(at(Math.max(...hours) * HOUR_MS).getTime());
      }),
    );
  });
});

describe('needsRefresh', () => {
  it('asks for a reading when nothing is known or something is not fresh', () => {
    expect(needsRefresh([])).toBe(true);
    expect(needsRefresh(latestLimits([reading()], NOW, STALE_AFTER_MS))).toBe(false);
    expect(needsRefresh(latestLimits([reading({ readAt: at(-2 * HOUR_MS) })], NOW, STALE_AFTER_MS))).toBe(true);
  });
});

describe('utilizationFromPercent', () => {
  it('maps a percentage to a ratio clamped between 0 and 1', () => {
    expect(utilizationFromPercent(42)).toBe(0.42);
    expect(utilizationFromPercent(130)).toBe(1);
    expect(utilizationFromPercent(-3)).toBe(0);
  });
});
