import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMAND_NAMES } from './contract/index.ts';

const SOURCE_ROOT = join(process.cwd(), 'src');
const TEST_FILE = /\.test\.tsx?$/;
const SOURCE_FILE = /\.tsx?$/;
const NOT_INTERFACE = new Set(['contract', 'test']);

function filesUnder(directory: string, keep: (path: string) => boolean): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return NOT_INTERFACE.has(entry) && directory === SOURCE_ROOT ? [] : filesUnder(path, keep);
    return keep(path) ? [path] : [];
  });
}

function mentions(path: string, name: string): boolean {
  const text = readFileSync(path, 'utf8');
  return text.includes(`'${name}'`) || text.includes(`"${name}"`);
}

const interfaceFiles = filesUnder(SOURCE_ROOT, (path) => SOURCE_FILE.test(path) && !TEST_FILE.test(path));
const testFiles = filesUnder(SOURCE_ROOT, (path) => TEST_FILE.test(path) && !path.endsWith('command-surface.test.ts'));

describe('the interface and the commands of the factory', () => {
  it.each(COMMAND_NAMES)('offers %s to the operator', (name) => {
    const senders = interfaceFiles.filter((path) => mentions(path, name)).map((path) => relative(SOURCE_ROOT, path));
    expect(senders).not.toEqual([]);
  });

  it.each(COMMAND_NAMES)('proves in a test what %s sends', (name) => {
    const proofs = testFiles.filter((path) => mentions(path, name)).map((path) => relative(SOURCE_ROOT, path));
    expect(proofs).not.toEqual([]);
  });

  it('sends no command the contract does not define', () => {
    const known = new Set<string>(COMMAND_NAMES);
    const used = interfaceFiles.flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(/\b(?:command=|\.run\(|run\()\s*['"]([a-z]+\.[a-z-]+)['"]/g)].map((match) => match[1] ?? ''),
    );
    expect(used.filter((name) => !known.has(name))).toEqual([]);
  });
});
