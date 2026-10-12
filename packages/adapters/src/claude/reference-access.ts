import { bashRule } from './role-permissions.ts';

const PARAGRAPH = '\n\n';
const NEWLINE = '\n';
const PATH_SEPARATOR = '/';
const ANY_ARGUMENTS = '*';
const COPY_COMMAND = 'cp';
const RECURSIVE_COPY_FLAG = '-R';
const MAKE_DIRECTORY_COMMAND = 'mkdir -p';

export const REFERENCE_PROMPT_HEADING = '# Reference repositories';
export const REFERENCE_PROMPT_INTRODUCTION =
  'Other repositories that the specification cites are available as read-only snapshots on this machine, at the ref the specification names. Read their files with the Read, Grep and Glob tools.';
export const REFERENCE_COPY_RULE =
  'Copy a file with `cp <snapshot>/<file> <destination>` and a directory with `cp -R <snapshot>/<directory> <destination>`. A copy keeps the read-only mode of the original. Create a missing destination directory with `mkdir -p <directory>` first.';
export const REFERENCE_READ_ONLY_RULE = 'Never modify a snapshot.';

/** A reference whose snapshot is built, as an agent run sees it. */
export interface ReferenceMount {
  readonly name: string;
  readonly repository: string;
  readonly ref: string;
  /** The commit the snapshot was built from. */
  readonly commit: string;
  readonly path: string;
}

/** The snapshots a run may use, read again for every run: a snapshot rebuilt or built since the last run is found. */
export type ReferenceMounts = () => Promise<readonly ReferenceMount[]>;

export const NO_REFERENCE_MOUNTS: ReferenceMounts = () => Promise.resolve([]);

/**
 * The shell commands that copy from a snapshot: `cp` and `cp -R` with the source under the snapshot, and `mkdir -p`
 * to create the destination directory first. The sandbox still confines every write to the worktree.
 */
export function referenceCopyRules(mounts: readonly ReferenceMount[]): readonly string[] {
  if (mounts.length === 0) return [];
  return [
    bashRule(`${MAKE_DIRECTORY_COMMAND} ${ANY_ARGUMENTS}`),
    ...mounts.flatMap((mount) => [
      bashRule(`${COPY_COMMAND} ${mount.path}${PATH_SEPARATOR}${ANY_ARGUMENTS}`),
      bashRule(`${COPY_COMMAND} ${RECURSIVE_COPY_FLAG} ${mount.path}${PATH_SEPARATOR}${ANY_ARGUMENTS}`),
    ]),
  ];
}

function mountLine(mount: ReferenceMount): string {
  return `- \`${mount.name}\`: \`${mount.repository}\` at \`${mount.ref}\` (commit \`${mount.commit}\`), read from \`${mount.path}\``;
}

/** What a run is told about the snapshots: where they are, that they are read-only, and how a writing role copies from them. */
export function referencePromptSection(mounts: readonly ReferenceMount[], copyAllowed: boolean): string | null {
  if (mounts.length === 0) return null;
  const rules = copyAllowed ? [REFERENCE_COPY_RULE, REFERENCE_READ_ONLY_RULE] : [REFERENCE_READ_ONLY_RULE];
  return [REFERENCE_PROMPT_HEADING, REFERENCE_PROMPT_INTRODUCTION, mounts.map(mountLine).join(NEWLINE), rules.join(' ')].join(PARAGRAPH);
}
