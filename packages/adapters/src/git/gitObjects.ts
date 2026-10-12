import { execFile } from 'node:child_process';
import { GIT_COMMAND_TIMEOUT_MS } from './constants.ts';

/** The largest file a commit's file is read up to. */
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
/** The largest diff read in one go; a larger one is refused rather than cut at a random place. */
export const MAX_DIFF_BYTES = 32 * 1024 * 1024;
/** The patch of one file is cut past this size, and says so. */
export const MAX_FILE_PATCH_CHARACTERS = 512 * 1024;
/** A range lists at most this many commits, the newest ones. */
export const MAX_RANGE_COMMITS = 50;

const GIT_EXECUTABLE = 'git';
const OBJECT_NAME = /^[0-9a-f]{7,64}$/;
const REF_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const UNSAFE_PATH_SEGMENTS: readonly string[] = ['', '.', '..'];
const PATH_SEPARATOR = '/';
const NUL = '\0';
const FILE_HEADER = 'diff --git ';
const NEW_FILE_MARKER = '+++ ';
const OLD_FILE_MARKER = '--- ';
const NO_FILE = '/dev/null';
const NEW_SIDE_PREFIX = 'b/';
const OLD_SIDE_PREFIX = 'a/';
const RENAME_TO = 'rename to ';
const QUOTE = '"';
const NEWLINE = '\n';
const MISSING_OBJECT_EXIT_CODE = 128;
const COMMIT_FIELD_SEPARATOR = '\u001f';
const COMMIT_RECORD_SEPARATOR = '\u001e';
const COMMIT_FIELDS = ['%H', '%an', '%cI', '%B'] as const;
const COMMIT_FORMAT = `${COMMIT_FIELDS.join('%x1f')}%x1e`;

/** One file's part of a diff. */
export interface FilePatch {
  readonly path: string;
  readonly patch: string;
  /** Whether the patch was cut at MAX_FILE_PATCH_CHARACTERS. */
  readonly truncated: boolean;
}

/** A commit as the repository records it: who made it, when, and what it says. */
export interface RepositoryCommit {
  readonly sha: string;
  readonly message: string;
  readonly authorName: string;
  readonly committedAt: Date;
}

function parseCommits(output: string): readonly RepositoryCommit[] {
  return output
    .split(COMMIT_RECORD_SEPARATOR)
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record !== '')
    .map((record) => {
      const [sha = '', authorName = '', committedAt = '', ...message] = record.split(COMMIT_FIELD_SEPARATOR);
      return { sha, authorName, committedAt: new Date(committedAt), message: message.join(COMMIT_FIELD_SEPARATOR).trim() };
    });
}

export class UnsafeObjectRequestError extends Error {
  constructor(what: string) {
    super(`${JSON.stringify(what)} names no object of the repository that can be read`);
    this.name = 'UnsafeObjectRequestError';
  }
}

function isSafePath(path: string): boolean {
  return !path.startsWith(PATH_SEPARATOR) && !path.includes(NUL) && path.split(PATH_SEPARATOR).every((segment) => !UNSAFE_PATH_SEGMENTS.includes(segment));
}

function unquoted(path: string): string {
  if (!path.startsWith(QUOTE) || !path.endsWith(QUOTE)) return path;
  try {
    return JSON.parse(path) as string;
  } catch {
    return path.slice(1, -1);
  }
}

function sidePath(line: string, marker: string, prefix: string): string | null {
  const path = unquoted(line.slice(marker.length).trim());
  if (path === NO_FILE) return null;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function pathOf(patch: string): string {
  const lines = patch.split(NEWLINE);
  const renamed = lines.find((line) => line.startsWith(RENAME_TO));
  if (renamed !== undefined) return unquoted(renamed.slice(RENAME_TO.length));
  const added = lines.find((line) => line.startsWith(NEW_FILE_MARKER));
  const newPath = added === undefined ? null : sidePath(added, NEW_FILE_MARKER, NEW_SIDE_PREFIX);
  if (newPath !== null) return newPath;
  const removed = lines.find((line) => line.startsWith(OLD_FILE_MARKER));
  const oldPath = removed === undefined ? null : sidePath(removed, OLD_FILE_MARKER, OLD_SIDE_PREFIX);
  if (oldPath !== null) return oldPath;
  const header = lines[0]?.slice(FILE_HEADER.length) ?? '';
  const newSide = header.lastIndexOf(` ${NEW_SIDE_PREFIX}`);
  if (newSide === -1) return header;
  const path = unquoted(header.slice(newSide + 1));
  return path.startsWith(NEW_SIDE_PREFIX) ? path.slice(NEW_SIDE_PREFIX.length) : path;
}

/** Splits a unified diff into one patch per file, each cut at MAX_FILE_PATCH_CHARACTERS. */
export function filePatches(diff: string): readonly FilePatch[] {
  const starts: number[] = [];
  let offset = diff.startsWith(FILE_HEADER) ? 0 : diff.indexOf(`${NEWLINE}${FILE_HEADER}`);
  while (offset !== -1) {
    const start = diff.startsWith(FILE_HEADER, offset) ? offset : offset + NEWLINE.length;
    starts.push(start);
    offset = diff.indexOf(`${NEWLINE}${FILE_HEADER}`, start + FILE_HEADER.length);
  }
  return starts.map((start, index) => {
    const patch = diff.slice(start, starts[index + 1] ?? diff.length).replace(/\n$/, '');
    const truncated = patch.length > MAX_FILE_PATCH_CHARACTERS;
    return { path: pathOf(patch), patch: truncated ? patch.slice(0, MAX_FILE_PATCH_CHARACTERS) : patch, truncated };
  });
}

interface GitOutput {
  readonly exitCode: number;
  readonly stdout: Buffer;
  readonly stderr: string;
}

/** Reads files and diffs from the object store of a repository, without touching any working tree. */
export class GitObjects {
  private readonly repository: string;
  private readonly environment: Readonly<Record<string, string>>;

  constructor(repository: string, environment: Readonly<Record<string, string>>) {
    this.repository = repository;
    this.environment = environment;
  }

  /** The file as the commit holds it, or null when the commit or the file is not in the repository. */
  async file(sha: string, path: string): Promise<Uint8Array | null> {
    if (!OBJECT_NAME.test(sha)) throw new UnsafeObjectRequestError(sha);
    if (!isSafePath(path)) throw new UnsafeObjectRequestError(path);
    const output = await this.git(['cat-file', 'blob', `${sha}:${path}`], MAX_FILE_BYTES);
    if (output.exitCode === MISSING_OBJECT_EXIT_CODE) return null;
    if (output.exitCode !== 0) throw new Error(`git cat-file failed in ${this.repository}: ${output.stderr.trim()}`);
    return output.stdout;
  }

  /** What changed from one commit to another, file by file. */
  async diff(base: string, head: string): Promise<readonly FilePatch[]> {
    for (const sha of [base, head]) if (!OBJECT_NAME.test(sha)) throw new UnsafeObjectRequestError(sha);
    const output = await this.git(['diff', '--no-color', '--no-ext-diff', '--find-renames', base, head], MAX_DIFF_BYTES);
    if (output.exitCode !== 0) throw new Error(`git diff ${base} ${head} failed in ${this.repository}: ${output.stderr.trim()}`);
    return filePatches(output.stdout.toString('utf8'));
  }

  /**
   * The commits that `head` has and `base` does not, along the first parents, oldest first and at most
   * MAX_RANGE_COMMITS of the newest. Null when the repository holds neither commit: nothing is known of the range.
   */
  async commitsBetween(base: string, head: string): Promise<readonly RepositoryCommit[] | null> {
    for (const sha of [base, head]) if (!OBJECT_NAME.test(sha)) throw new UnsafeObjectRequestError(sha);
    const output = await this.git(
      ['log', '--first-parent', '--reverse', `--max-count=${MAX_RANGE_COMMITS}`, `--format=${COMMIT_FORMAT}`, `${base}..${head}`],
      MAX_DIFF_BYTES,
    );
    if (output.exitCode === MISSING_OBJECT_EXIT_CODE) return null;
    if (output.exitCode !== 0) throw new Error(`git log ${base}..${head} failed in ${this.repository}: ${output.stderr.trim()}`);
    return parseCommits(output.stdout.toString('utf8'));
  }

  /** The commit a branch or a remote branch points at, or null when the repository has no such ref. */
  async resolve(ref: string): Promise<string | null> {
    if (!REF_NAME.test(ref)) throw new UnsafeObjectRequestError(ref);
    const output = await this.git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], MAX_FILE_BYTES);
    return output.exitCode === 0 ? output.stdout.toString('utf8').trim() : null;
  }

  private git(args: readonly string[], maxBytes: number): Promise<GitOutput> {
    return new Promise((resolve, reject) => {
      execFile(
        GIT_EXECUTABLE,
        ['-C', this.repository, ...args],
        { encoding: 'buffer', maxBuffer: maxBytes, timeout: GIT_COMMAND_TIMEOUT_MS, env: this.environment, windowsHide: true },
        (error, stdout, stderr) => {
          if (error !== null && typeof error.code !== 'number') {
            reject(error);
            return;
          }
          resolve({ exitCode: error === null ? 0 : Number(error.code), stdout, stderr: stderr.toString('utf8') });
        },
      );
    });
  }
}
