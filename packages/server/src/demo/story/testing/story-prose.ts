import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { StoryWorkspace } from './story-workspace.ts';

const EXCLUDED_ENTRIES: readonly string[] = ['node_modules', '.factory'];
const FILE_LINE_REFERENCE = /([\w./-]+\.\w+):(\d+)/g;
const PATH_GROUP = 1;
const LINE_GROUP = 2;
const NEWLINE = '\n';
const UTF8 = 'utf8';

export const CODE_FENCE = '`'.repeat(3);

/** Words that would describe the demonstration inside what is meant to read as a real team's work. */
export const MENTIONS_OF_THE_DEMONSTRATION: readonly RegExp[] = [
  /demo/i,
  /fixture/i,
  /mock/i,
  /scenario/i,
  /\bstor(?:y|ies)\b/i,
  /on purpose/i,
  /cockpit/i,
  /test case/i,
];

/** Every string reachable from a value, whatever the depth. */
export function collectStrings(value: unknown): readonly string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(collectStrings);
  return [];
}

/** The text of every file under a directory, by its path from that directory. */
export function filesUnder(directory: string): ReadonlyMap<string, string> {
  const files = new Map<string, string>();
  const visit = (current: string): void => {
    for (const name of readdirSync(current)) {
      if (EXCLUDED_ENTRIES.includes(name)) continue;
      const path = join(current, name);
      if (statSync(path).isDirectory()) visit(path);
      else files.set(relative(directory, path), readFileSync(path, UTF8));
    }
  };
  visit(directory);
  return files;
}

export interface FileLineReference {
  readonly path: string;
  readonly line: number;
}

/** The `path:line` references a text makes, such as `src/catalog.js:5`. */
export function fileLineReferences(text: string): readonly FileLineReference[] {
  return [...text.matchAll(FILE_LINE_REFERENCE)].map((match) => ({ path: match[PATH_GROUP] ?? '', line: Number(match[LINE_GROUP]) }));
}

function lineCount(text: string): number {
  const lines = text.split(NEWLINE);
  return text.endsWith(NEWLINE) ? lines.length - 1 : lines.length;
}

/** The references of the texts that name a file or a line the workspace does not hold. */
export function unresolvedReferences(workspace: StoryWorkspace, texts: readonly string[]): readonly string[] {
  return texts.flatMap(fileLineReferences).flatMap((reference) => {
    try {
      const count = lineCount(workspace.read(reference.path));
      return reference.line >= 1 && reference.line <= count ? [] : [`${reference.path}:${reference.line} (the file has ${count} lines)`];
    } catch {
      return [`${reference.path}:${reference.line} (no such file)`];
    }
  });
}
