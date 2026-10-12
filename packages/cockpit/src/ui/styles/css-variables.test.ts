import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFINITION = /(--[\w-]+)\s*:/g;
const BARE_USE = /var\(\s*(--[\w-]+)\s*\)/g;

function stylesheets(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return path.endsWith('.css') ? [path] : [];
  });
}

function matches(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? '');
}

describe('stylesheets', () => {
  const files = stylesheets(SOURCE_ROOT);
  const sources = files.map((path) => ({ file: relative(SOURCE_ROOT, path), text: readFileSync(path, 'utf8') }));
  const defined = new Set(sources.flatMap(({ text }) => matches(DEFINITION, text)));

  it('read at least the design tokens and one stylesheet per area', () => {
    expect(sources.map(({ file }) => file)).toEqual(expect.arrayContaining(['ui/styles/tokens.css', 'app/app.css']));
  });

  it('use only custom properties that some rule defines, so no color or size silently falls back to inherited', () => {
    const undefinedUses = sources.flatMap(({ file, text }) =>
      matches(BARE_USE, text)
        .filter((name) => !defined.has(name))
        .map((name) => `${file} uses ${name}`),
    );
    expect([...new Set(undefinedUses)]).toEqual([]);
  });
});
