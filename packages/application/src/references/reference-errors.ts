import type { ReferenceRepository } from '@agent-factory/domain';

export const FETCH_TAGS_ARGUMENTS = 'fetch --tags';
const PROBLEM_SEPARATOR = '; ';

export class ReferenceRevisionNotFoundError extends Error {
  constructor(reference: ReferenceRepository, source: string) {
    super(`reference ${reference.name}: ${source} has no ${reference.ref} for ${reference.repository}; update the clone with git -C ${source} ${FETCH_TAGS_ARGUMENTS}`);
    this.name = 'ReferenceRevisionNotFoundError';
  }
}

export class ReferenceSourceUnreadableError extends Error {
  constructor(reference: ReferenceRepository, source: string, detail: string) {
    super(`reference ${reference.name}: ${source} cannot be read as a git clone: ${detail}`);
    this.name = 'ReferenceSourceUnreadableError';
  }
}

/** The name or the ref of a reference cannot name a snapshot safely. */
export class InvalidReferenceError extends Error {
  constructor(reference: Pick<ReferenceRepository, 'name'>, problems: readonly string[]) {
    super(`reference ${reference.name}: ${problems.join(PROBLEM_SEPARATOR)}`);
    this.name = 'InvalidReferenceError';
  }
}

export class ReferencesNotReadyError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`reference repositories are not ready:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.name = 'ReferencesNotReadyError';
    this.problems = problems;
  }
}
