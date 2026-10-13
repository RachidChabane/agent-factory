import { EVIDENCE_PREFIX } from '../acceptance/acceptance-manifest.ts';

const NEWLINE = '\n';
const FILE_HEADER_START = 'diff --git ';
const QUOTE = '"';
const NULL_DEVICE = '/dev/null';
const RENAME_SOURCE = /^(?:rename|copy) from (.+)$/;
const RENAME_TARGET = /^(?:rename|copy) to (.+)$/;
const SAME_PATH_HEADER = /^diff --git a\/(.+) b\/\1$/;
const ANY_PATH_HEADER = /^diff --git (?:"a\/(.*)"|a\/(.*?)) (?:"b\/(.*)"|b\/(.*))$/;

function unquoted(path: string): string {
  return path.startsWith(QUOTE) ? path.slice(1) : path;
}

function headerPaths(header: string): readonly string[] {
  const same = SAME_PATH_HEADER.exec(header);
  if (same !== null) return [same[1] ?? ''];
  const any = ANY_PATH_HEADER.exec(header);
  if (any === null) return [];
  return [any[1] ?? any[2] ?? '', any[3] ?? any[4] ?? ''];
}

function renamedPaths(block: readonly string[]): readonly string[] {
  const source = block.map((line) => RENAME_SOURCE.exec(line)?.[1]).find((path) => path !== undefined);
  const target = block.map((line) => RENAME_TARGET.exec(line)?.[1]).find((path) => path !== undefined);
  return source === undefined || target === undefined ? [] : [source, target];
}

function pathsTouched(block: readonly string[]): readonly string[] {
  const renamed = renamedPaths(block);
  const paths = renamed.length > 0 ? renamed : headerPaths(block[0] ?? '');
  return paths.map(unquoted).filter((path) => path !== NULL_DEVICE);
}

function touchesOnlyEvidence(block: readonly string[]): boolean {
  const paths = pathsTouched(block);
  return paths.length > 0 && paths.every((path) => path.startsWith(EVIDENCE_PREFIX));
}

/** The lines of a diff grouped by file: the text before the first file header forms a block of its own. */
function fileBlocks(diff: string): readonly (readonly string[])[] {
  const blocks: string[][] = [[]];
  for (const line of diff.split(NEWLINE)) {
    if (line.startsWith(FILE_HEADER_START)) blocks.push([]);
    blocks.at(-1)?.push(line);
  }
  return blocks;
}

/**
 * The diff without the files that live under the factory's evidence directory. The factory commits those
 * proofs for an earlier head and regenerates them after the review, so a reviewer must never see them.
 * A rename into or out of that directory stays, because it moves a file the change owns.
 */
export function diffWithoutEvidence(diff: string): string {
  return fileBlocks(diff)
    .filter((block) => !touchesOnlyEvidence(block))
    .flat()
    .join(NEWLINE);
}
