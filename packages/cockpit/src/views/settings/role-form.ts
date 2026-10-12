import type { AgentRole, EffortLevel } from '@agent-factory/domain';
import { EFFORT_LEVELS, MAX_MODEL_NAME_LENGTH, MAX_ROLE_TURNS, MIN_ROLE_TURNS, MODEL_NAME_PATTERN } from '@agent-factory/domain';
import type { CommandBody, RoleSetting } from '../../contract/index.ts';
import type { DecimalNotation } from './decimal-notation.ts';
import { isRunBudget, isWithin } from './limits.ts';

/** What the fields of a role show: the budget and the turns are text until they parse. */
export interface RoleDraft {
  readonly model: string;
  readonly effort: EffortLevel;
  readonly maxBudget: string;
  readonly maxTurns: string;
}

export interface RoleProblems {
  readonly model: boolean;
  readonly maxBudget: boolean;
  readonly maxTurns: boolean;
}

export type RoleChange = CommandBody<'settings.update-role'>['change'];

export function roleDraftOf(setting: RoleSetting, notation: DecimalNotation): RoleDraft {
  return { model: setting.model, effort: setting.effort, maxBudget: notation.format(setting.maxBudgetUsd), maxTurns: notation.format(setting.maxTurns) };
}

function isModelName(model: string): boolean {
  const name = model.trim();
  return name.length > 0 && name.length <= MAX_MODEL_NAME_LENGTH && MODEL_NAME_PATTERN.test(name);
}

function isTurns(value: number | null): value is number {
  return isWithin(value, MIN_ROLE_TURNS, MAX_ROLE_TURNS);
}

export function roleProblems(draft: RoleDraft, notation: DecimalNotation): RoleProblems {
  return {
    model: !isModelName(draft.model),
    maxBudget: !isRunBudget(notation.parse(draft.maxBudget)),
    maxTurns: !isTurns(notation.parseWhole(draft.maxTurns)),
  };
}

/**
 * The change the factory takes, built field by field: the timeout of a role is read-only and is
 * not part of it. Null while a field is invalid.
 */
export function roleChangeOf(role: AgentRole, draft: RoleDraft, notation: DecimalNotation): RoleChange | null {
  const maxBudgetUsd = notation.parse(draft.maxBudget);
  const maxTurns = notation.parseWhole(draft.maxTurns);
  if (!isModelName(draft.model) || !isRunBudget(maxBudgetUsd) || !isTurns(maxTurns)) return null;
  return { role, model: draft.model, effort: draft.effort, maxBudgetUsd, maxTurns };
}

export function isRoleChanged(draft: RoleDraft, setting: RoleSetting, notation: DecimalNotation): boolean {
  return (
    draft.model !== setting.model ||
    draft.effort !== setting.effort ||
    notation.parse(draft.maxBudget) !== setting.maxBudgetUsd ||
    notation.parseWhole(draft.maxTurns) !== setting.maxTurns
  );
}

/** The models a role may be given: those the installation lists, and the role's own model even when the installation does not list it. */
export function modelOptions(models: readonly string[], current: string): readonly string[] {
  return models.includes(current) ? models : [current, ...models];
}

/** The effort level a select value stands for; undefined for any other text. */
export function effortLevelOf(value: string): EffortLevel | undefined {
  return EFFORT_LEVELS.find((level) => level === value);
}
