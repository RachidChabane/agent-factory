import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_CONCURRENT_RUNS,
  MAX_DAILY_CAP_USD,
  MAX_FREE_MEMORY_THRESHOLD_PERCENT,
  MAX_ROLE_TURNS,
  MAX_RUN_BUDGET_USD,
  MIN_FREE_MEMORY_THRESHOLD_PERCENT,
  settingsChangeProblems,
  type BudgetSettingsChange,
  type ConcurrencySettingsChange,
  type ResourcesSettingsChange,
  type RoleSettingsChange,
} from './settings-bounds.ts';

const ROLE: RoleSettingsChange = { kind: 'role', project: null, role: 'implementer', model: 'sonnet', effort: 'medium', maxBudgetUsd: 10, maxTurns: 150 };
const RESOURCES: ResourcesSettingsChange = { kind: 'resources', minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal', maxConcurrentRuns: 2 };
const BUDGET: BudgetSettingsChange = { kind: 'budget', dailyCap: { kind: 'usd', amount: 50 }, perRunCapUsd: 10 };
const CONCURRENCY: ConcurrencySettingsChange = { kind: 'concurrency', project: 'storefront', issues: 1, ceiling: 3 };

describe('settings bounds', () => {
  it('accepts the values a configured factory runs with', () => {
    expect(settingsChangeProblems(ROLE)).toEqual([]);
    expect(settingsChangeProblems({ ...ROLE, project: 'storefront', model: 'claude-opus-4-1[1m]' })).toEqual([]);
    expect(settingsChangeProblems(RESOURCES)).toEqual([]);
    expect(settingsChangeProblems({ ...RESOURCES, pauseAbovePressure: 'warn' })).toEqual([]);
    expect(settingsChangeProblems(BUDGET)).toEqual([]);
    expect(settingsChangeProblems({ ...BUDGET, dailyCap: { kind: 'none' }, perRunCapUsd: null })).toEqual([]);
    expect(settingsChangeProblems(CONCURRENCY)).toEqual([]);
  });

  it('refuses a role whose model, budget or turns leave the bounds', () => {
    expect(settingsChangeProblems({ ...ROLE, model: 'sonnet; rm -rf /' })).toEqual(['the model "sonnet; rm -rf /" is not a model name']);
    expect(settingsChangeProblems({ ...ROLE, maxBudgetUsd: 0 })).toHaveLength(1);
    expect(settingsChangeProblems({ ...ROLE, maxBudgetUsd: MAX_RUN_BUDGET_USD + 1 })).toHaveLength(1);
    expect(settingsChangeProblems({ ...ROLE, maxTurns: MAX_ROLE_TURNS + 1 })).toHaveLength(1);
    expect(settingsChangeProblems({ ...ROLE, maxTurns: 2.5 })).toHaveLength(1);
  });

  it('never lets scheduling run on through critical memory pressure', () => {
    expect(settingsChangeProblems({ ...RESOURCES, pauseAbovePressure: 'critical' })).toHaveLength(1);
  });

  it('keeps the free-memory threshold and the concurrent runs within bounds', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, min: -1_000, max: 1_000 }), (percent) => {
        const accepted = settingsChangeProblems({ ...RESOURCES, minimumFreeMemoryPercent: percent }).length === 0;
        return accepted === (percent >= MIN_FREE_MEMORY_THRESHOLD_PERCENT && percent <= MAX_FREE_MEMORY_THRESHOLD_PERCENT);
      }),
    );
    expect(settingsChangeProblems({ ...RESOURCES, maxConcurrentRuns: 0 })).toHaveLength(1);
    expect(settingsChangeProblems({ ...RESOURCES, maxConcurrentRuns: MAX_CONCURRENT_RUNS + 1 })).toHaveLength(1);
  });

  it('refuses a daily cap of zero: no cap is said with none', () => {
    expect(settingsChangeProblems({ ...BUDGET, dailyCap: { kind: 'usd', amount: 0 } })).toEqual([
      `a daily cap must be above 0 and at most ${MAX_DAILY_CAP_USD} USD, or none, got 0`,
    ]);
    expect(settingsChangeProblems({ ...BUDGET, dailyCap: { kind: 'usd', amount: MAX_DAILY_CAP_USD + 1 } })).toHaveLength(1);
    expect(settingsChangeProblems({ ...BUDGET, perRunCapUsd: 0 })).toHaveLength(1);
  });

  it('keeps the concurrency ceiling at or above the concurrent issues', () => {
    expect(settingsChangeProblems({ ...CONCURRENCY, issues: 0 })).toHaveLength(1);
    expect(settingsChangeProblems({ ...CONCURRENCY, issues: 3, ceiling: 2 })).toHaveLength(1);
  });
});
