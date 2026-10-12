import type { DailyCap } from './budget.ts';
import { EFFORT_LEVELS, type AgentRole, type EffortLevel } from './model.ts';
import { PAUSE_ABOVE_PRESSURE_LEVELS, type MemoryPressureLevel } from './resource-admission.ts';

export const MIN_CONCURRENT_ISSUES = 1;
export const MIN_FREE_MEMORY_THRESHOLD_PERCENT = 10;
export const MAX_FREE_MEMORY_THRESHOLD_PERCENT = 90;
export const MAX_RUN_BUDGET_USD = 100;
export const MIN_ROLE_TURNS = 1;
export const MAX_ROLE_TURNS = 500;
export const MAX_DAILY_CAP_USD = 1_000;
export const MIN_CONCURRENT_RUNS = 1;
export const MAX_CONCURRENT_RUNS = 16;
export const MAX_MODEL_NAME_LENGTH = 100;
export const MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:[\]-]*$/;

/** A role's model and limits, for one project (`project` is its id) or for every project (`project` is null). */
export interface RoleSettingsChange {
  readonly kind: 'role';
  readonly project: string | null;
  readonly role: AgentRole;
  readonly model: string;
  readonly effort: EffortLevel;
  readonly maxBudgetUsd: number;
  readonly maxTurns: number;
}

/** The machine limits every project shares. */
export interface ResourcesSettingsChange {
  readonly kind: 'resources';
  readonly minimumFreeMemoryPercent: number;
  readonly pauseAbovePressure: MemoryPressureLevel;
  readonly maxConcurrentRuns: number;
}

export interface BudgetSettingsChange {
  readonly kind: 'budget';
  readonly dailyCap: DailyCap;
  /** Null leaves each role's own budget as the only per-run limit. */
  readonly perRunCapUsd: number | null;
}

/** How many issues one project works on at once, and the most the operator may raise that to. */
export interface ConcurrencySettingsChange {
  readonly kind: 'concurrency';
  readonly project: string;
  readonly issues: number;
  readonly ceiling: number;
}

export type SettingsChange = RoleSettingsChange | ResourcesSettingsChange | BudgetSettingsChange | ConcurrencySettingsChange;
export const SETTINGS_CHANGE_KINDS = ['role', 'resources', 'budget', 'concurrency'] as const;

function within(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function runBudgetProblem(what: string, value: number): readonly string[] {
  return Number.isFinite(value) && value > 0 && value <= MAX_RUN_BUDGET_USD
    ? []
    : [`${what} must be above 0 and at most ${MAX_RUN_BUDGET_USD} USD, got ${value}`];
}

function roleProblems(change: RoleSettingsChange): readonly string[] {
  const model = change.model.trim();
  return [
    ...(model.length > 0 && model.length <= MAX_MODEL_NAME_LENGTH && MODEL_NAME_PATTERN.test(model)
      ? []
      : [`the model "${change.model}" is not a model name`]),
    ...(EFFORT_LEVELS.includes(change.effort) ? [] : [`the effort "${change.effort}" is not one of ${EFFORT_LEVELS.join(', ')}`]),
    ...runBudgetProblem(`the ${change.role} budget`, change.maxBudgetUsd),
    ...(Number.isInteger(change.maxTurns) && within(change.maxTurns, MIN_ROLE_TURNS, MAX_ROLE_TURNS)
      ? []
      : [`the ${change.role} turns must be a whole number from ${MIN_ROLE_TURNS} to ${MAX_ROLE_TURNS}, got ${change.maxTurns}`]),
  ];
}

function isPauseAboveLevel(level: MemoryPressureLevel): boolean {
  return PAUSE_ABOVE_PRESSURE_LEVELS.some((allowed) => allowed === level);
}

function resourcesProblems(change: ResourcesSettingsChange): readonly string[] {
  return [
    ...(within(change.minimumFreeMemoryPercent, MIN_FREE_MEMORY_THRESHOLD_PERCENT, MAX_FREE_MEMORY_THRESHOLD_PERCENT)
      ? []
      : [
          `the free-memory threshold must be from ${MIN_FREE_MEMORY_THRESHOLD_PERCENT} to ${MAX_FREE_MEMORY_THRESHOLD_PERCENT} %, got ${change.minimumFreeMemoryPercent}`,
        ]),
    ...(isPauseAboveLevel(change.pauseAbovePressure)
      ? []
      : [`scheduling must pause above ${PAUSE_ABOVE_PRESSURE_LEVELS.join(' or ')} memory pressure, not ${change.pauseAbovePressure}`]),
    ...(Number.isInteger(change.maxConcurrentRuns) && within(change.maxConcurrentRuns, MIN_CONCURRENT_RUNS, MAX_CONCURRENT_RUNS)
      ? []
      : [`the concurrent agent runs must be a whole number from ${MIN_CONCURRENT_RUNS} to ${MAX_CONCURRENT_RUNS}, got ${change.maxConcurrentRuns}`]),
  ];
}

function dailyCapProblems(dailyCap: DailyCap): readonly string[] {
  if (dailyCap.kind === 'none') return [];
  return dailyCap.amount > 0 && within(dailyCap.amount, 0, MAX_DAILY_CAP_USD)
    ? []
    : [`a daily cap must be above 0 and at most ${MAX_DAILY_CAP_USD} USD, or none, got ${dailyCap.amount}`];
}

function budgetProblems(change: BudgetSettingsChange): readonly string[] {
  return [...dailyCapProblems(change.dailyCap), ...(change.perRunCapUsd === null ? [] : runBudgetProblem('the per-run cap', change.perRunCapUsd))];
}

function concurrencyProblems(change: ConcurrencySettingsChange): readonly string[] {
  return [
    ...(Number.isInteger(change.issues) && change.issues >= MIN_CONCURRENT_ISSUES
      ? []
      : [`the concurrent issues must be a whole number from ${MIN_CONCURRENT_ISSUES}, got ${change.issues}`]),
    ...(Number.isInteger(change.ceiling) && change.ceiling >= change.issues
      ? []
      : [`the concurrency ceiling must be a whole number no lower than the concurrent issues, got ${change.ceiling}`]),
  ];
}

export function settingsChangeProblems(change: SettingsChange): readonly string[] {
  switch (change.kind) {
    case 'role':
      return roleProblems(change);
    case 'resources':
      return resourcesProblems(change);
    case 'budget':
      return budgetProblems(change);
    case 'concurrency':
      return concurrencyProblems(change);
  }
}
