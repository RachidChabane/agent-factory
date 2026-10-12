import type { AgentRole } from '@agent-factory/domain';
import type { RoleSetting } from '../../contract/index.ts';
import { MODEL_HAIKU, MODEL_OPUS, MODEL_SONNET } from './people.ts';

export const PER_RUN_CAP_USD = 5;

export const ROLE_SETTINGS: readonly RoleSetting[] = [
  { role: 'challenger', model: MODEL_OPUS, effort: 'high', maxBudgetUsd: 4, maxTurns: 150, timeoutMinutes: 40 },
  { role: 'acceptance-author', model: MODEL_OPUS, effort: 'medium', maxBudgetUsd: 4, maxTurns: 120, timeoutMinutes: 30 },
  { role: 'implementer', model: MODEL_SONNET, effort: 'high', maxBudgetUsd: 5, maxTurns: 150, timeoutMinutes: 60 },
  { role: 'reviewer', model: MODEL_OPUS, effort: 'medium', maxBudgetUsd: 3, maxTurns: 60, timeoutMinutes: 20 },
  { role: 'auditor', model: MODEL_OPUS, effort: 'medium', maxBudgetUsd: 3, maxTurns: 80, timeoutMinutes: 25 },
  { role: 'release-auditor', model: MODEL_OPUS, effort: 'medium', maxBudgetUsd: 3, maxTurns: 80, timeoutMinutes: 25 },
  { role: 'summarizer', model: MODEL_HAIKU, effort: 'low', maxBudgetUsd: 1, maxTurns: 30, timeoutMinutes: 10 },
];

export function roleSetting(role: AgentRole): RoleSetting {
  const setting = ROLE_SETTINGS.find((candidate) => candidate.role === role);
  if (setting === undefined) throw new Error(`no setting for the role ${role}`);
  return setting;
}
