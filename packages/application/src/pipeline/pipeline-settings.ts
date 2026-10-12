import type { EffortLevel, EscalationProfile, ResourceAdmissionPolicy } from '@agent-factory/domain';
import type { ProjectConventions } from '../conventions/project-conventions.ts';

export const PIPELINE_ROLES = ['acceptance-author', 'implementer', 'reviewer'] as const;
export type PipelineRole = (typeof PIPELINE_ROLES)[number];

export interface RoleProfile {
  readonly model: string;
  readonly effort: EffortLevel;
  readonly maxBudgetUsd: number;
  readonly maxTurns: number;
  readonly timeoutMs: number;
}

export interface NetworkGrant {
  readonly reason: string;
}

export interface NamedCommand {
  readonly name: string;
  readonly run: string;
  readonly network?: NetworkGrant;
}

export interface GateSettings {
  readonly commandsBeforeAcceptance: readonly NamedCommand[];
  readonly commandsAfterAcceptance: readonly NamedCommand[];
  readonly commandTimeoutMs: number;
  readonly environment: Readonly<Record<string, string>>;
  readonly niceness: number | null;
}


export interface RepositoryCoordinates {
  readonly owner: string;
  readonly name: string;
}

export interface PipelineSettings {
  readonly repository: RepositoryCoordinates;
  readonly setupCommands: readonly NamedCommand[];
  readonly roles: Readonly<Record<PipelineRole, RoleProfile>>;
  readonly implementerEscalation: EscalationProfile;
  readonly gate: GateSettings;
  readonly conventions: ProjectConventions;
  readonly evidenceCacheDirectory: string;
  readonly resources: ResourceAdmissionPolicy;
}
