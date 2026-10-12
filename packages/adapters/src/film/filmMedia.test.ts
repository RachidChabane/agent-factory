import fc from 'fast-check';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_KEY_FRAMES } from './constants.ts';
import { largestVideo, screenshotFiles, selectScreenshots, videoFiles } from './filmMedia.ts';

describe('film media', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'film-media-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function write(path: string, size: number): Promise<void> {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), 'x'.repeat(size));
  }

  it('finds the videos and the screenshots anywhere under the output, whatever the case of their extension', async () => {
    await write('a.mp4', 1);
    await write('run/b.WEBM', 1);
    await write('run/deep/c.mov', 1);
    await write('d.mkv', 1);
    await write('notes.txt', 1);
    await write('s/one.png', 1);
    await write('s/two.JPG', 1);
    await write('three.jpeg', 1);
    await write('four.webp', 1);
    await write('five.svg', 1);
    await write('replay.json', 1);

    expect((await videoFiles(directory)).map((file) => file.path).sort()).toEqual(['a.mp4', 'd.mkv', 'run/b.WEBM', 'run/deep/c.mov']);
    expect((await screenshotFiles(directory)).map((file) => file.path).sort()).toEqual(['five.svg', 'four.webp', 's/one.png', 's/two.JPG', 'three.jpeg']);
  });

  it('finds nothing in an output directory that does not exist', async () => {
    expect(await videoFiles(join(directory, 'missing'))).toEqual([]);
  });

  it('takes the largest video as the film, and the first in path order among equals', async () => {
    await write('small.mp4', 1);
    await write('run/large.webm', 9);
    await write('run/a-large.webm', 9);
    expect(largestVideo(await videoFiles(directory))).toBe('run/a-large.webm');
    expect(largestVideo([])).toBeNull();
  });
});

describe('selecting screenshots', () => {
  const PATHS = ['screens/03-end.png', 'screens/01-start.png', 'screens/02-middle.png'];

  it('puts the last screenshot in path order first, then the key frames the report names', () => {
    expect(selectScreenshots(PATHS, ['screens/01-start.png'])).toEqual(['screens/03-end.png', 'screens/01-start.png']);
  });

  it('matches a key frame by its path or by its end, and ignores one that does not exist', () => {
    expect(selectScreenshots(PATHS, ['02-middle.png', 'missing.png', './screens/01-start.png'])).toEqual([
      'screens/03-end.png',
      'screens/02-middle.png',
      'screens/01-start.png',
    ]);
  });

  it('keeps the final screenshot once when a key frame names it', () => {
    expect(selectScreenshots(PATHS, ['03-end.png'])).toEqual(['screens/03-end.png']);
  });

  it('has no screenshot when there is none', () => {
    expect(selectScreenshots([], ['a.png'])).toEqual([]);
  });

  it('never keeps more than the final screenshot and six key frames, all taken from what the output holds', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.stringMatching(/^[a-z]{1,6}\.png$/), { maxLength: 20 }), fc.array(fc.stringMatching(/^[a-z]{1,6}\.png$/), { maxLength: 20 }), (paths, keyFrames) => {
        const selected = selectScreenshots(paths, keyFrames);
        return selected.length <= MAX_KEY_FRAMES + 1 && selected.every((path) => paths.includes(path)) && new Set(selected).size === selected.length;
      }),
    );
  });
});
