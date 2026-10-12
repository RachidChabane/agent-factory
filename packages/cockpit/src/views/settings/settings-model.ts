import type { EffortLevel } from '@agent-factory/domain';
import { EFFORT_LEVELS } from '@agent-factory/domain';
import type { MemoryPressure, RoleSetting, ToolConnection, ToolName } from '../../contract/index.ts';
import { MEMORY_PRESSURES, TOOL_NAMES } from '../../contract/index.ts';
import { MEMORY_PRESSURE_LABELS } from '../../i18n/labels.ts';

export const BUDGET_STEP = 0.1;
export const MIN_TURNS = 1;
export const MIN_MEMORY_THRESHOLD_PERCENT = 10;
export const MAX_MEMORY_THRESHOLD_PERCENT = 90;
export const MIN_CONCURRENCY = 1;

const ELISION_PATTERN = /^[aeiouyéèêàîô]/i;

export interface RoleDraft {
  readonly model: string;
  readonly effort: EffortLevel;
  readonly maxBudgetUsd: string;
  readonly maxTurns: string;
}

export interface RoleErrors {
  readonly maxBudgetUsd: string | null;
  readonly maxTurns: string | null;
}

export function draftFromRole(role: RoleSetting): RoleDraft {
  return { model: role.model, effort: role.effort, maxBudgetUsd: String(role.maxBudgetUsd), maxTurns: String(role.maxTurns) };
}

export function parseNumber(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function roleErrors(draft: RoleDraft): RoleErrors {
  const budget = parseNumber(draft.maxBudgetUsd);
  const turns = parseNumber(draft.maxTurns);
  return {
    maxBudgetUsd: budget === null || budget <= 0 ? 'Saisissez un budget supérieur à 0.' : null,
    maxTurns: turns === null || !Number.isInteger(turns) || turns < MIN_TURNS ? 'Saisissez un nombre entier de tours (1 minimum).' : null,
  };
}

export function isRoleValid(draft: RoleDraft): boolean {
  const errors = roleErrors(draft);
  return errors.maxBudgetUsd === null && errors.maxTurns === null;
}

export function isRoleChanged(draft: RoleDraft, role: RoleSetting): boolean {
  return (
    draft.model !== role.model ||
    draft.effort !== role.effort ||
    parseNumber(draft.maxBudgetUsd) !== role.maxBudgetUsd ||
    parseNumber(draft.maxTurns) !== role.maxTurns
  );
}

export function effortFrom(value: string): EffortLevel | null {
  return EFFORT_LEVELS.find((level) => level === value) ?? null;
}

export function pressureFrom(value: string): MemoryPressure | null {
  return MEMORY_PRESSURES.find((pressure) => pressure === value) ?? null;
}

export function pauseLabel(pressure: MemoryPressure): string {
  const label = MEMORY_PRESSURE_LABELS[pressure];
  return `Au-delà ${ELISION_PATTERN.test(label) ? 'd’' : 'de '}${label}`;
}

export interface LimitsDraft {
  readonly concurrencyCeiling: string;
  readonly freeMemoryThresholdPercent: string;
  readonly pauseAbovePressure: MemoryPressure;
}

export interface LimitsErrors {
  readonly concurrencyCeiling: string | null;
  readonly freeMemoryThresholdPercent: string | null;
}

export function limitsErrors(draft: LimitsDraft, maximum: number): LimitsErrors {
  const ceiling = parseNumber(draft.concurrencyCeiling);
  const threshold = parseNumber(draft.freeMemoryThresholdPercent);
  const ceilingInvalid = ceiling === null || !Number.isInteger(ceiling) || ceiling < MIN_CONCURRENCY || ceiling > maximum;
  const thresholdInvalid =
    threshold === null || threshold < MIN_MEMORY_THRESHOLD_PERCENT || threshold > MAX_MEMORY_THRESHOLD_PERCENT;
  return {
    concurrencyCeiling: ceilingInvalid ? `Saisissez un entier entre ${MIN_CONCURRENCY} et ${maximum}.` : null,
    freeMemoryThresholdPercent: thresholdInvalid
      ? `Saisissez un pourcentage entre ${MIN_MEMORY_THRESHOLD_PERCENT} et ${MAX_MEMORY_THRESHOLD_PERCENT}.`
      : null,
  };
}

export function sortTools(tools: readonly ToolConnection[]): ToolConnection[] {
  const order = (tool: ToolConnection) => TOOL_NAMES.indexOf(tool.tool);
  const rank = (tool: ToolConnection) => (tool.status === 'connected' ? 1 : 0);
  return [...tools].sort((left, right) => rank(left) - rank(right) || order(left) - order(right));
}

export function connectedCount(tools: readonly ToolConnection[]): number {
  return tools.filter((tool) => tool.status === 'connected').length;
}

export function uncheckedTools(tools: readonly ToolConnection[]): readonly ToolName[] {
  const checked = new Set(tools.map((tool) => tool.tool));
  return TOOL_NAMES.filter((tool) => !checked.has(tool));
}
