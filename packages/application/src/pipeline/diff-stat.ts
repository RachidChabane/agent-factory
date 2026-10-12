export interface DiffStatEntry {
  readonly path: string;
  readonly added: number;
  readonly removed: number;
}

const FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/;
const ADDED_LINE = '+';
const REMOVED_LINE = '-';
const HUNK_HEADER = '@@';
const NEWLINE = '\n';

export function diffStat(diff: string): readonly DiffStatEntry[] {
  const entries: { path: string; added: number; removed: number }[] = [];
  let inHunk = false;
  for (const line of diff.split(NEWLINE)) {
    const header = FILE_HEADER.exec(line);
    if (header !== null) {
      entries.push({ path: header[2] ?? header[1] ?? '', added: 0, removed: 0 });
      inHunk = false;
      continue;
    }
    const current = entries.at(-1);
    if (current === undefined) continue;
    if (line.startsWith(HUNK_HEADER)) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith(ADDED_LINE)) current.added += 1;
    else if (line.startsWith(REMOVED_LINE)) current.removed += 1;
  }
  return entries;
}

export function renderDiffStat(entries: readonly DiffStatEntry[]): string {
  const totalAdded = entries.reduce((sum, entry) => sum + entry.added, 0);
  const totalRemoved = entries.reduce((sum, entry) => sum + entry.removed, 0);
  const lines = entries.map((entry) => `${entry.path} | +${entry.added} -${entry.removed}`);
  return [...lines, `${entries.length} files changed, +${totalAdded} -${totalRemoved}`].join(NEWLINE);
}
