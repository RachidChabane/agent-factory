import { EFFORT_LEVELS, type AgentRole, type EffortLevel } from './model.ts';
import { PAUSE_ABOVE_PRESSURE_LEVELS, type MemoryPressureLevel } from './resource-admission.ts';

export const MIN_CONCURRENT_ISSUES = 1;
export const MIN_FREE_MEMORY_THRESHOLD_PERCENT = 10;
export const MAX_FREE_MEMORY_THRESHOLD_PERCENT = 90;
export const MAX_RUN_BUDGET_USD = 100;
export const MIN_ROLE_TURNS = 1;
export const MAX_ROLE_TURNS = 500;
export const MAX_DAILY_CAP_USD = 1_000;
export const NO_DAILY_CAP_USD = 0;
export const MIN_PAUSE_UTILIZATION = 0.05;
export const MAX_PAUSE_UTILIZATION = 1;
export const MAX_MODEL_NAME_LENGTH = 100;
export const MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:[\]-]*$/;

export interface RoleSettingsChange {
  readonly kind: 'role';
  readonly role: AgentRole;
  readonly model: string;
  readonly effort: EffortLevel;
  readonly maxBudgetUsd: number;
  readonly maxTurns: number;
}

export interface LimitsSettingsChange {
  readonly kind: 'limits';
  readonly concurrentIssues: number;
  readonly minimumFreeMemoryPercent: number;
  readonly pauseAbovePressure: MemoryPressureLevel;
}

export interface CapsSettingsChange {
  readonly kind: 'caps';
  readonly dailyCapUsd: number;
  readonly perRunCapUsd: number;
  readonly pauseAtUtilization: number;
}

export type SettingsChange = RoleSettingsChange | LimitsSettingsChange | CapsSettingsChange;
export const SETTINGS_CHANGE_KINDS = ['role', 'limits', 'caps'] as const;

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

function limitsProblems(change: LimitsSettingsChange): readonly string[] {
  return [
    ...(Number.isInteger(change.concurrentIssues) && change.concurrentIssues >= MIN_CONCURRENT_ISSUES
      ? []
      : [`the concurrent issues must be a whole number from ${MIN_CONCURRENT_ISSUES}, got ${change.concurrentIssues}`]),
    ...(within(change.minimumFreeMemoryPercent, MIN_FREE_MEMORY_THRESHOLD_PERCENT, MAX_FREE_MEMORY_THRESHOLD_PERCENT)
      ? []
      : [
          `the free-memory threshold must be from ${MIN_FREE_MEMORY_THRESHOLD_PERCENT} to ${MAX_FREE_MEMORY_THRESHOLD_PERCENT} %, got ${change.minimumFreeMemoryPercent}`,
        ]),
    ...(isPauseAboveLevel(change.pauseAbovePressure)
      ? []
      : [`scheduling must pause above ${PAUSE_ABOVE_PRESSURE_LEVELS.join(' or ')} memory pressure, not ${change.pauseAbovePressure}`]),
  ];
}

function capsProblems(change: CapsSettingsChange): readonly string[] {
  return [
    ...(within(change.dailyCapUsd, NO_DAILY_CAP_USD, MAX_DAILY_CAP_USD)
      ? []
      : [`the daily cap must be from ${NO_DAILY_CAP_USD} (no cap) to ${MAX_DAILY_CAP_USD} USD, got ${change.dailyCapUsd}`]),
    ...runBudgetProblem('the per-run cap', change.perRunCapUsd),
    ...(within(change.pauseAtUtilization, MIN_PAUSE_UTILIZATION, MAX_PAUSE_UTILIZATION)
      ? []
      : [`the pause utilization must be from ${MIN_PAUSE_UTILIZATION} to ${MAX_PAUSE_UTILIZATION}, got ${change.pauseAtUtilization}`]),
  ];
}

export function settingsChangeProblems(change: SettingsChange): readonly string[] {
  switch (change.kind) {
    case 'role':
      return roleProblems(change);
    case 'limits':
      return limitsProblems(change);
    case 'caps':
      return capsProblems(change);
  }
}

export function dailyCapOf(dailyCapUsd: number): number | null {
  return dailyCapUsd === NO_DAILY_CAP_USD ? null : dailyCapUsd;
}
