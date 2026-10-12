export const REFERENCE_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
/** The file beside a snapshot that records the commit it was built from. */
export const REFERENCE_COMMIT_SUFFIX = '.commit';
/** A snapshot is built beside its final place under this name, then renamed into it. */
export const REFERENCE_PARTIAL_SUFFIX = '.partial';
/** The snapshot a rebuild replaces waits under this name until the new one is in place. */
export const REFERENCE_RETIRED_SUFFIX = '.retired';
export const REFERENCE_ARCHIVE_SUFFIX = '.tar';
/** Keeps what a file allows to read and run, whoever the user, and takes every write permission away. */
export const REFERENCE_FILE_MODE_MASK = 0o555;
/**
 * Directories stay writable by their owner: a directory copied out of a snapshot keeps the mode of the original,
 * and git removes the files of a worktree only from directories it may write to.
 */
export const REFERENCE_DIRECTORY_MODE = 0o755;
export const REFERENCE_MARKER_MODE = 0o444;
export const COMMIT_ID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
export const TAR_EXECUTABLE = 'tar';
export const REVISION_COMMIT_SUFFIX = '^{commit}';
export const UTF8 = 'utf8';
export const MISSING_FILE_CODES: readonly string[] = ['ENOENT', 'ENOTDIR'];
