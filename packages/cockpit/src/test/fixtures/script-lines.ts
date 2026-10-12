import type { PatchedFile } from './patch.ts';

/** The summary line a diff shows for the files of a pull request. */
export function diffStat(files: readonly PatchedFile[]): string {
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  return `${files.length} files changed, ${additions} insertions(+), ${deletions} deletions(-)`;
}

/** What the editing tool answers after it changed a file; the extra counts are lines a later edit took back. */
export function editedLine(file: PatchedFile, extraAdditions = 0, extraDeletions = 0): string {
  return `Edited ${file.path} (+${file.additions + extraAdditions} −${file.deletions + extraDeletions})`;
}

export function createdLine(path: string): string {
  return `File created: ${path}`;
}

/** An answer that carries structured data, as a fenced block of JSON. */
export function fenced(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

const HUNK_START = /^@@ -\d+,\d+ \+(\d+),\d+ @@/;

/** The line a search for `needle` finds in the new version of a file, in the form the search tool prints it. */
export function grepHit(file: PatchedFile, needle: string): string {
  let next = 0;
  for (const line of file.patch.split('\n')) {
    const start = HUNK_START.exec(line);
    if (start !== null) {
      next = Number(start[1]);
    } else if (line.startsWith('-')) {
      continue;
    } else {
      if (line.includes(needle)) return `${file.path}:${next}:${line.slice(1)}`;
      next += 1;
    }
  }
  throw new Error(`${file.path} has no line with ${needle}`);
}
