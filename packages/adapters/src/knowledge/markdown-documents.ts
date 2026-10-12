import { readdir } from 'node:fs/promises';

export const SECTION_SEPARATOR = '\n\n';

const MARKDOWN_EXTENSION = '.md';
const HEADING_PREFIX = '## ';
const MISSING_PATH_CODES: readonly string[] = ['ENOENT', 'ENOTDIR'];

export function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && MISSING_PATH_CODES.includes(error.code);
}

export async function listMarkdownFileNames(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(MARKDOWN_EXTENSION))
    .map((entry) => entry.name)
    .sort();
}

export function markdownSection(heading: string, content: string): string {
  return `${HEADING_PREFIX}${heading}${SECTION_SEPARATOR}${content.trim()}`;
}
