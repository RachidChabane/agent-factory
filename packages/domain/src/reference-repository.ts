/** The name of a reference inside its project: a path segment, so a plain slug. */
export const REFERENCE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const REFERENCE_NAME_MAX_LENGTH = 64;
export const REFERENCE_NAME_RULE = `lowercase letters and digits, in groups separated by single hyphens, at most ${REFERENCE_NAME_MAX_LENGTH} characters`;

/**
 * A tag or a commit id. It reaches a git command line, a directory name, a shell permission rule and a
 * sandbox profile, so it never starts with a hyphen, never holds a separator, a wildcard or a blank, and never climbs.
 */
export const REFERENCE_REVISION_PATTERN = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const REFERENCE_REVISION_MAX_LENGTH = 128;
export const REFERENCE_REVISION_RULE = `a tag or commit: letters, digits, dot, underscore and hyphen, starting with a letter or digit, without two dots in a row, at most ${REFERENCE_REVISION_MAX_LENGTH} characters`;

/** Joins the name and the ref in the directory name of a snapshot. */
export const REFERENCE_SNAPSHOT_SEPARATOR = '@';

/** What a project's snapshot of a reference is: usable, impossible to build because its source lacks the ref, or waiting to be built. */
export const REFERENCE_SNAPSHOT_STATUSES = ['ready', 'missing-ref', 'not-built'] as const;
export type ReferenceSnapshotStatus = (typeof REFERENCE_SNAPSHOT_STATUSES)[number];

/** Another repository that specifications cite, at the version they name. */
export interface ReferenceRepository {
  readonly name: string;
  /** The `owner/name` a specification cites. */
  readonly repository: string;
  readonly ref: string;
}

export function isReferenceName(name: string): boolean {
  return name.length <= REFERENCE_NAME_MAX_LENGTH && REFERENCE_NAME_PATTERN.test(name);
}

export function isReferenceRevision(ref: string): boolean {
  return ref.length <= REFERENCE_REVISION_MAX_LENGTH && REFERENCE_REVISION_PATTERN.test(ref);
}

/** What keeps the reference from naming a snapshot safely; empty when it names one. */
export function referenceProblems(reference: Pick<ReferenceRepository, 'name' | 'ref'>): readonly string[] {
  return [
    ...(isReferenceName(reference.name) ? [] : [`the name must be ${REFERENCE_NAME_RULE}`]),
    ...(isReferenceRevision(reference.ref) ? [] : [`the ref must be ${REFERENCE_REVISION_RULE}`]),
  ];
}

export function referenceSnapshotName(reference: Pick<ReferenceRepository, 'name' | 'ref'>): string {
  return `${reference.name}${REFERENCE_SNAPSHOT_SEPARATOR}${reference.ref}`;
}
