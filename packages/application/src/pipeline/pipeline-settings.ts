import type { EffortLevel, EscalationProfile, EvidenceLimits, ResourceAdmissionPolicy } from '@agent-factory/domain';
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

/** A long-running process of a stack, and the command that succeeds once it answers. */
export interface StackService {
  readonly name: string;
  readonly run: string;
  readonly ready: { readonly run: string; readonly timeoutMs: number };
  readonly network?: NetworkGrant;
}

/** What acceptance checks need running around them: services the factory starts in the workspace under test, then stops. */
export interface StackSettings {
  readonly setup: readonly NamedCommand[];
  readonly services: readonly StackService[];
  readonly teardown: readonly NamedCommand[];
  readonly environment: Readonly<Record<string, string>>;
  /** The issue types whose checks need the stack; every type when empty. */
  readonly issueTypes: readonly string[];
  readonly stopGraceMs: number;
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
  /** What the evidence committed to a pull request may weigh: the files over it are left out. */
  readonly evidenceLimits: EvidenceLimits;
  readonly resources: ResourceAdmissionPolicy;
  readonly stack: StackSettings | null;
}
