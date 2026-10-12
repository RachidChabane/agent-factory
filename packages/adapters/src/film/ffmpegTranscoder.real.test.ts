import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { FfmpegTranscoder } from './ffmpegTranscoder.ts';

const FFMPEG_AVAILABLE = spawnSync('ffmpeg', ['-version']).status === 0;
const FFPROBE_AVAILABLE = spawnSync('ffprobe', ['-version']).status === 0;
const ODD_SIZE = '321x181';
const FRAME_RATE = 10;
const AVC_BOX = 'avc1';
const FILE_TYPE_BOX = 'ftyp';
const BOX_NAME_OFFSET = 4;

describe.skipIf(!FFMPEG_AVAILABLE)('FfmpegTranscoder with the real ffmpeg', () => {
  let directory = '';

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'film-ffmpeg-'));
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('turns a Matroska video of an odd size into an H.264 MP4 of an even size', async () => {
    const source = join(directory, 'film.mkv');
    const target = join(directory, 'film.mkv.h264.mp4');
    const made = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `testsrc=duration=1:size=${ODD_SIZE}:rate=${FRAME_RATE}`, '-c:v', 'mpeg4', source]);
    expect(made.status).toBe(0);

    await new FfmpegTranscoder(new SpawnCommandRunner(), { PATH: process.env['PATH'] }).toMp4(source, target);

    const bytes = await readFile(target);
    expect(bytes.subarray(BOX_NAME_OFFSET, BOX_NAME_OFFSET + FILE_TYPE_BOX.length).toString('latin1')).toBe(FILE_TYPE_BOX);
    expect(bytes.includes(AVC_BOX)).toBe(true);
    if (FFPROBE_AVAILABLE) {
      const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', target]);
      expect(probe.stdout.toString().trim()).toBe('h264,320,180');
    }
  });

  it('fails with ffmpeg\'s own words on a file that is no video', async () => {
    const notVideo = join(directory, 'notes.mkv');
    await rm(notVideo, { force: true });
    await expect(new FfmpegTranscoder(new SpawnCommandRunner(), { PATH: process.env['PATH'] }).toMp4(notVideo, join(directory, 'never.mp4'))).rejects.toThrow('ffmpeg exited with');
  });
});
