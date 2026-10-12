import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_FILMS_DIRECTORY } from '../demo-paths.ts';
import { SAMPLE_VIDEOS } from './demo-film.ts';

const FFPROBE_AVAILABLE = spawnSync('ffprobe', ['-version']).status === 0;
const EXPECTED_STREAM = 'h264,320,180';
const EXPECTED_SECONDS = 3;
const DURATION_TOLERANCE_SECONDS = 0.1;

function probe(file: string, entries: string): string {
  const run = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', entries, '-of', 'csv=p=0', join(DEMO_FILMS_DIRECTORY, file)]);
  return run.stdout.toString().trim();
}

describe.skipIf(!FFPROBE_AVAILABLE).each(Object.entries(SAMPLE_VIDEOS))('the sample video of the %s, read by ffprobe', (_phase, file) => {
  it('is H.264 video of 320 by 180 pixels', () => {
    expect(probe(file, 'stream=codec_name,width,height')).toBe(EXPECTED_STREAM);
  });

  it('lasts three seconds', () => {
    expect(Math.abs(Number(probe(file, 'stream=duration')) - EXPECTED_SECONDS)).toBeLessThanOrEqual(DURATION_TOLERANCE_SECONDS);
  });
});
