import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileLogArchive, UnsafeLogNameError } from './fileLogArchive.ts';

describe('FileLogArchive', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'factory-logs-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('stores logs per issue and reads them back', async () => {
    const archive = new FileLogArchive(directory);
    expect(await archive.write(42, 'gate-attempt-1.log', 'lint ok')).toBe(join(directory, 'issue-42', 'gate-attempt-1.log'));
    expect(await archive.read(42, 'gate-attempt-1.log')).toBe('lint ok');
    expect(await archive.read(43, 'gate-attempt-1.log')).toBeNull();
  });

  it('refuses names that are not plain file names', async () => {
    const archive = new FileLogArchive(directory);
    await expect(archive.write(42, '../escape.log', 'x')).rejects.toBeInstanceOf(UnsafeLogNameError);
  });
});
