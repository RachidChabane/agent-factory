import type { ChangedFile, FilePatchView, PullRequestDiff } from '../../contract/index.ts';

const CONTEXT_MARK = ' ';
const ADDITION_MARK = '+';
const DELETION_MARK = '-';
const NEWLINE = '\n';
const NEW_FILE_OLD_START = 0;
const FIRST_LINE = 1;

/** A changed file as the fixtures author it: the totals the snapshot carries and the patch the diff route serves. */
export interface PatchedFile extends ChangedFile {
  readonly patch: string;
}

/** What the snapshot says of the files: their totals, without the patches that are read on demand. */
export function changedFiles(files: readonly PatchedFile[]): ChangedFile[] {
  return files.map(({ path, additions, deletions }) => ({ path, additions, deletions }));
}

/** The diff the factory serves for a pull request whose files are these. */
export function diffOf(pullRequestNumber: number, files: readonly PatchedFile[], shas: { readonly baseSha: string; readonly headSha: string; readonly readAt: string }): PullRequestDiff {
  const patches: FilePatchView[] = files.map(({ path, patch }) => ({ path, patch, truncated: false }));
  return { pullRequestNumber, baseSha: shas.baseSha, headSha: shas.headSha, readAt: shas.readAt, files: patches };
}

export function ctx(text: string): string {
  return `${CONTEXT_MARK}${text}`;
}

export function add(text: string): string {
  return `${ADDITION_MARK}${text}`;
}

export function del(text: string): string {
  return `${DELETION_MARK}${text}`;
}

export interface Hunk {
  /** The first line of the hunk in the file before the change. */
  readonly oldStart: number;
  readonly heading: string | null;
  readonly lines: readonly string[];
}

export function hunk(oldStart: number, lines: readonly string[], heading: string | null = null): Hunk {
  return { oldStart, heading, lines };
}

function countWhere(lines: readonly string[], marks: readonly string[]): number {
  return lines.filter((line) => marks.includes(line.charAt(0))).length;
}

function additionsIn(lines: readonly string[]): number {
  return countWhere(lines, [ADDITION_MARK]);
}

function deletionsIn(lines: readonly string[]): number {
  return countWhere(lines, [DELETION_MARK]);
}

function renderHunk(source: Hunk, newStart: number): string {
  const oldCount = countWhere(source.lines, [CONTEXT_MARK, DELETION_MARK]);
  const newCount = countWhere(source.lines, [CONTEXT_MARK, ADDITION_MARK]);
  const heading = source.heading === null ? '' : ` ${source.heading}`;
  return [`@@ -${source.oldStart},${oldCount} +${newStart},${newCount} @@${heading}`, ...source.lines].join(NEWLINE);
}

/** A modified file whose hunk headers count their own lines, so the patch and the totals cannot disagree. */
export function editedFile(path: string, hunks: readonly Hunk[]): PatchedFile {
  let shift = 0;
  const rendered = hunks.map((source) => {
    const text = renderHunk(source, source.oldStart + shift);
    shift += additionsIn(source.lines) - deletionsIn(source.lines);
    return text;
  });
  return {
    path,
    additions: hunks.reduce((sum, source) => sum + additionsIn(source.lines), 0),
    deletions: hunks.reduce((sum, source) => sum + deletionsIn(source.lines), 0),
    patch: rendered.join(NEWLINE),
  };
}

export function createdFile(path: string, lines: readonly string[]): PatchedFile {
  const added = lines.map(add);
  return {
    path,
    additions: added.length,
    deletions: 0,
    patch: [`@@ -${NEW_FILE_OLD_START},0 +${FIRST_LINE},${added.length} @@`, ...added].join(NEWLINE),
  };
}

export function fileAt(files: readonly PatchedFile[], path: string): PatchedFile {
  const file = files.find((candidate) => candidate.path === path);
  if (file === undefined) throw new Error(`no changed file at ${path}`);
  return file;
}

/** The lines a created file holds, read back from its patch. */
export function contentOf(file: PatchedFile): string {
  return file.patch
    .split(NEWLINE)
    .slice(1)
    .map((line) => line.slice(1))
    .join(NEWLINE);
}
