import type { RepositoryFiles } from './repository-inspection.ts';

export type DraftReleaseModel = { readonly kind: 'release-please' } | { readonly kind: 'tags' } | { readonly kind: 'none' };

export interface DraftAutomation {
  readonly name: string;
  readonly branches?: readonly string[];
  readonly authors?: readonly string[];
}

const RELEASE_PLEASE_FILES = ['release-please-config.json', '.release-please-manifest.json'] as const;
const DEPENDABOT_FILES = ['.github/dependabot.yml', '.github/dependabot.yaml'] as const;
const RENOVATE_FILES = ['renovate.json', 'renovate.json5', '.github/renovate.json', '.github/renovate.json5', '.renovaterc', '.renovaterc.json'] as const;
const VERSION_TAG = /^v?\d+\.\d+\.\d+/;

export function usesReleasePlease(files: RepositoryFiles): boolean {
  return RELEASE_PLEASE_FILES.some((file) => files.has(file));
}

/** release-please when the repository configures it, version tags when it has some, otherwise none. */
export function detectReleaseModel(files: RepositoryFiles, tags: readonly string[]): DraftReleaseModel {
  if (usesReleasePlease(files)) return { kind: 'release-please' };
  return tags.some((tag) => VERSION_TAG.test(tag)) ? { kind: 'tags' } : { kind: 'none' };
}

/** The other automations that change the repository, whose changes are recorded but not audited. */
export function detectAutomations(files: RepositoryFiles): readonly DraftAutomation[] {
  return [
    ...(DEPENDABOT_FILES.some((file) => files.has(file)) ? [{ name: 'Dependabot', authors: ['dependabot[bot]'] }] : []),
    ...(RENOVATE_FILES.some((file) => files.has(file)) ? [{ name: 'Renovate', authors: ['renovate[bot]'] }] : []),
    ...(usesReleasePlease(files) ? [{ name: 'Release Please', branches: ['release-please--*'] }] : []),
  ];
}
