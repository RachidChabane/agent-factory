import { DEFAULT_ISSUE_TYPES, type AgentRole } from '@agent-factory/domain';
import type { IssueTypeInfo, NamedCommandView, ProjectSettingsView, ToolView } from '../../contract/index.ts';
import { ROLE_SETTINGS } from './roles.ts';

/** The issue types a project keeps from the default typology, in the order of that typology. */
export function issueTypeInfos(ids: readonly string[] | null): IssueTypeInfo[] {
  return DEFAULT_ISSUE_TYPES.filter((definition) => ids === null || ids.includes(definition.id)).map((definition) => ({
    id: definition.id,
    label: definition.label,
    proof: definition.proof,
    checks: definition.checks,
    commitType: definition.commit.type,
    commitScope: definition.commit.scope,
  }));
}

export function command(name: string, run: string, network: string | null = null): NamedCommandView {
  return { name, run, network };
}

export interface ProjectSettingsSeed {
  readonly overriddenPrompts: readonly AgentRole[];
  readonly concurrency: ProjectSettingsView['concurrency'];
  readonly setup: readonly NamedCommandView[];
  readonly beforeAcceptance: readonly NamedCommandView[];
  readonly afterAcceptance: readonly NamedCommandView[];
  readonly environmentVariables: readonly string[];
  readonly automations: ProjectSettingsView['automations'];
  readonly releaseModel: ProjectSettingsView['releaseModel'];
}

const GATE_TIMEOUT_MINUTES = 30;

export function projectSettings(seed: ProjectSettingsSeed): ProjectSettingsView {
  return {
    roles: ROLE_SETTINGS.map((setting) => ({ ...setting })),
    overriddenPrompts: [...seed.overriddenPrompts],
    concurrency: seed.concurrency,
    setup: [...seed.setup],
    gate: { beforeAcceptance: [...seed.beforeAcceptance], afterAcceptance: [...seed.afterAcceptance], timeoutMinutes: GATE_TIMEOUT_MINUTES },
    environmentVariables: [...seed.environmentVariables],
    labels: { factory: 'factory', validated: 'spec:validated', audit: 'audit', kindPrefix: 'kind:' },
    branchPrefix: 'factory/',
    automations: seed.automations.map((automation) => ({ ...automation })),
    releaseModel: seed.releaseModel,
  };
}

export type ToolSeed = Pick<ToolView, 'name' | 'scope' | 'builtIn'> & Partial<Omit<ToolView, 'name' | 'scope' | 'builtIn'>>;

export function toolView(seed: ToolSeed): ToolView {
  return {
    description: null,
    status: null,
    version: null,
    detail: null,
    fixCommand: null,
    installHint: null,
    checkedAt: null,
    loginCommand: null,
    lastLogin: null,
    keepAlive: null,
    ...seed,
  };
}

export function newestFirst<Item>(items: readonly Item[], timeOf: (item: Item) => string): Item[] {
  return [...items].sort((left, right) => timeOf(right).localeCompare(timeOf(left)));
}

export function oldestFirstByNumber<Item extends { readonly number: number }>(items: readonly Item[]): Item[] {
  return [...items].sort((left, right) => left.number - right.number);
}
