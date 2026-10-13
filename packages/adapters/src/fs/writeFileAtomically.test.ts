import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileAtomically } from './writeFileAtomically.ts';

describe('writeFileAtomically', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'factory-atomic-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('creates the file and the directories above it', async () => {
    const path = join(directory, 'state', 'nested', 'blockers.json');
    await writeFileAtomically(path, '{"blockers":[]}\n');
    expect(await readFile(path, 'utf8')).toBe('{"blockers":[]}\n');
  });

  it('gives the directories it creates the permissions it was asked for', async () => {
    const path = join(directory, 'private', 'blockers.json');
    await writeFileAtomically(path, 'content\n', { directoryMode: 0o700 });
    expect((await stat(join(directory, 'private'))).mode & 0o777).toBe(0o700);
  });

  it('replaces the content of a file that exists and leaves no temporary file next to it', async () => {
    const path = join(directory, 'blockers.json');
    await writeFileAtomically(path, 'first\n');
    await writeFileAtomically(path, 'second\n');
    expect(await readFile(path, 'utf8')).toBe('second\n');
    expect(await readdir(directory)).toEqual(['blockers.json']);
  });

  it('keeps the file as it was and cleans up when the replacement fails', async () => {
    const path = join(directory, 'taken');
    await mkdir(path);
    await expect(writeFileAtomically(path, 'content')).rejects.toThrow();
    expect(await readdir(directory)).toEqual(['taken']);
  });

  it('lets two writers replace the same file at once without failing', async () => {
    const path = join(directory, 'blockers.json');
    await Promise.all(Array.from({ length: 8 }, (_, index) => writeFileAtomically(path, `writer ${index}\n`)));
    expect(await readFile(path, 'utf8')).toMatch(/^writer \d\n$/);
    expect(await readdir(directory)).toEqual(['blockers.json']);
  });
});
