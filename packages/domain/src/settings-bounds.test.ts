import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  dailyCapOf,
  MAX_DAILY_CAP_USD,
  MAX_FREE_MEMORY_THRESHOLD_PERCENT,
  MAX_PAUSE_UTILIZATION,
  MAX_ROLE_TURNS,
  MAX_RUN_BUDGET_USD,
  MIN_FREE_MEMORY_THRESHOLD_PERCENT,
  MIN_PAUSE_UTILIZATION,
  NO_DAILY_CAP_USD,
  settingsChangeProblems,
  type CapsSettingsChange,
  type LimitsSettingsChange,
  type RoleSettingsChange,
} from './settings-bounds.ts';

const ROLE: RoleSettingsChange = { kind: 'role', role: 'implementer', model: 'sonnet', effort: 'medium', maxBudgetUsd: 10, maxTurns: 150 };
const LIMITS: LimitsSettingsChange = { kind: 'limits', concurrentIssues: 1, minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal' };
const CAPS: CapsSettingsChange = { kind: 'caps', dailyCapUsd: 50, perRunCapUsd: 10, pauseAtUtilization: 0.85 };

describe('settings bounds', () => {
  it('accepts the values a configured factory runs with', () => {
    expect(settingsChangeProblems(ROLE)).toEqual([]);
    expect(settingsChangeProblems({ ...ROLE, model: 'claude-opus-4-1[1m]' })).toEqual([]);
    expect(settingsChangeProblems(LIMITS)).toEqual([]);
    expect(settingsChangeProblems({ ...LIMITS, pauseAbovePressure: 'warn' })).toEqual([]);
    expect(settingsChangeProblems(CAPS)).toEqual([]);
  });

  it('refuses a role whose model, budget or turns leave the bounds', () => {
    expect(settingsChangeProblems({ ...ROLE, model: 'sonnet; rm -rf /' })).toEqual(['the model "sonnet; rm -rf /" is not a model name']);
    expect(settingsChangeProblems({ ...ROLE, maxBudgetUsd: 0 })).toHaveLength(1);
    expect(settingsChangeProblems({ ...ROLE, maxBudgetUsd: MAX_RUN_BUDGET_USD + 1 })).toHaveLength(1);
    expect(settingsChangeProblems({ ...ROLE, maxTurns: MAX_ROLE_TURNS + 1 })).toHaveLength(1);
    expect(settingsChangeProblems({ ...ROLE, maxTurns: 2.5 })).toHaveLength(1);
  });

  it('never lets scheduling run on through critical memory pressure', () => {
    expect(settingsChangeProblems({ ...LIMITS, pauseAbovePressure: 'critical' })).toEqual([
      'scheduling must pause above normal or warn memory pressure, not critical',
    ]);
  });

  it('accepts a free-memory threshold exactly inside its bounds', () => {
    fc.assert(
      fc.property(fc.double({ min: -50, max: 150, noNaN: true }), (threshold) =>
        (settingsChangeProblems({ ...LIMITS, minimumFreeMemoryPercent: threshold }).length === 0) ===
        (threshold >= MIN_FREE_MEMORY_THRESHOLD_PERCENT && threshold <= MAX_FREE_MEMORY_THRESHOLD_PERCENT),
      ),
    );
  });

  it('accepts caps exactly inside their bounds', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10, max: MAX_DAILY_CAP_USD * 2, noNaN: true }),
        fc.double({ min: -10, max: MAX_RUN_BUDGET_USD * 2, noNaN: true }),
        fc.double({ min: -1, max: 2, noNaN: true }),
        (dailyCapUsd, perRunCapUsd, pauseAtUtilization) =>
          (settingsChangeProblems({ kind: 'caps', dailyCapUsd, perRunCapUsd, pauseAtUtilization }).length === 0) ===
          (dailyCapUsd >= NO_DAILY_CAP_USD &&
            dailyCapUsd <= MAX_DAILY_CAP_USD &&
            perRunCapUsd > 0 &&
            perRunCapUsd <= MAX_RUN_BUDGET_USD &&
            pauseAtUtilization >= MIN_PAUSE_UTILIZATION &&
            pauseAtUtilization <= MAX_PAUSE_UTILIZATION),
      ),
    );
  });

  it('reads a zero daily cap as no cap', () => {
    expect(dailyCapOf(NO_DAILY_CAP_USD)).toBeNull();
    expect(dailyCapOf(25)).toBe(25);
  });
});
