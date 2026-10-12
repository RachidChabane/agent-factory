import { IDENTIFIER } from '../../config/schema/common.ts';
import type { ForgeKind } from '../../config/schema/project.ts';
import type { DraftAutomation, DraftReleaseModel } from './delivery-detection.ts';
import type { RepositoryFacts } from './repository-inspection.ts';
import type { StackCommands } from './stack-detectors.ts';

/** The owner a repository without a GitHub origin is shown under on its local forge. */
export const LOCAL_OWNER = 'local';
/** The identity of the factory's commits when the repository configures none. */
export const FALLBACK_IDENTITY = { name: 'Agent Factory', email: 'agent-factory@example.invalid' } as const;
const PROJECT_ID_PREFIX = 'project-';
const NOT_ID_CHARACTERS = /[^a-z0-9-]+/g;
const NOT_SLUG_CHARACTERS = /[^A-Za-z0-9_.-]+/g;
const EDGE_DASHES = /^-+|-+$/g;
const DASH = '-';

export interface ProjectDraftInput {
  readonly id: string;
  readonly name: string;
  readonly forge: ForgeKind;
  readonly repository: string;
  readonly facts: RepositoryFacts;
  readonly stack: StackCommands | null;
  readonly release: DraftReleaseModel;
  readonly automations: readonly DraftAutomation[];
}

/** A project id from a repository name: lowercase letters, digits and dashes, starting with a letter. */
export function projectIdOf(name: string): string {
  const candidate = name.toLowerCase().replace(NOT_ID_CHARACTERS, DASH).replace(EDGE_DASHES, '');
  return IDENTIFIER.test(candidate) ? candidate : `${PROJECT_ID_PREFIX}${candidate}`.replace(EDGE_DASHES, '');
}

export function localRepositorySlug(name: string): string {
  return `${LOCAL_OWNER}/${name.replace(NOT_SLUG_CHARACTERS, DASH)}`;
}

/** The project entry config.yaml receives: only what was inspected, every other setting left to its default. */
export function projectDraft(input: ProjectDraftInput): Readonly<Record<string, unknown>> & { readonly id: string } {
  const { stack, release, automations } = input;
  return {
    id: input.id,
    name: input.name,
    forge: { kind: input.forge, repository: input.repository },
    baseBranch: input.facts.defaultBranch,
    commitIdentity: input.facts.identity ?? FALLBACK_IDENTITY,
    ...(stack === null || stack.setup.length === 0 ? {} : { setup: stack.setup }),
    ...(stack === null ? {} : { gate: { beforeAcceptance: stack.beforeAcceptance, afterAcceptance: stack.afterAcceptance } }),
    ...(release.kind === 'none' ? {} : { delivery: { release } }),
    ...(automations.length === 0 ? {} : { audits: { ignore: automations } }),
  };
}
