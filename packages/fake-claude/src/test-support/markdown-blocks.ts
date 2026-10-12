import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const README_FILE = fileURLToPath(new URL('../../README.md', import.meta.url));

const FENCE_MARKER = '`';
const MINIMUM_FENCE_LENGTH = 3;

/** The content of the first fenced block of `language` after the line `heading`, or null when there is none. */
export function firstFencedBlockAfter(markdown: string, heading: string, language: string): string | null {
  const lines = markdown.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) {
    return null;
  }
  const opening = new RegExp(`^(${FENCE_MARKER}{${String(MINIMUM_FENCE_LENGTH)},})${language}$`);
  let fence: string | null = null;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (fence === null) {
      fence = opening.exec(line)?.[1] ?? null;
    } else if (line === fence) {
      return body.join('\n');
    } else {
      body.push(line);
    }
  }
  return null;
}

export function readmeExample(): unknown {
  const block = firstFencedBlockAfter(readFileSync(README_FILE, 'utf8'), '## Complete example', 'json');
  if (block === null) {
    throw new Error('the README has no complete example');
  }
  const parsed: unknown = JSON.parse(block);
  return parsed;
}
