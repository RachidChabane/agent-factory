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

/** Where the project's forge shows a file of a commit: the links of a pull request body. */
export interface ForgeFileLinks {
  file(sha: string, path: string): string;
  /** The file's own bytes, for an image the body shows inline. */
  rawFile(sha: string, path: string): string;
}

export interface PipelineSettings {
  readonly repository: RepositoryCoordinates;
  readonly fileLinks: ForgeFileLinks;
  readonly setupCommands: readonly NamedCommand[];
  readonly roles: Readonly<Record<PipelineRole, RoleProfile>>;
  readonly implementerEscalation: EscalationProfile;
  readonly gate: GateSettings;
  readonly conventions: ProjectConventions;
  readonly evidenceCacheDirectory: string;
  readonly resources: ResourceAdmissionPolicy;
}
