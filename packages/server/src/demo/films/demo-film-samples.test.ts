import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_FILMS_DIRECTORY } from '../demo-paths.ts';
import { SAMPLE_VIDEOS } from './demo-film.ts';

/** The most a sample video weighs: they are the only videos the repository holds. */
const MAX_SAMPLE_KILOBYTES = 40;
const BYTES_PER_KILOBYTE = 1024;
const FILE_TYPE_BOX = 'ftyp';
const BOX_NAME_OFFSET = 4;

describe.each(Object.entries(SAMPLE_VIDEOS))('the sample video of the %s', (_phase, file) => {
  it('is a small MP4 file', async () => {
    const path = join(DEMO_FILMS_DIRECTORY, file);
    expect((await stat(path)).size).toBeLessThanOrEqual(MAX_SAMPLE_KILOBYTES * BYTES_PER_KILOBYTE);
    const header = (await readFile(path)).subarray(BOX_NAME_OFFSET, BOX_NAME_OFFSET + FILE_TYPE_BOX.length).toString('latin1');
    expect(header).toBe(FILE_TYPE_BOX);
  });
});
