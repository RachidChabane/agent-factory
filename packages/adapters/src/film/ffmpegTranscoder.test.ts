import { FilmRecordingError, type CommandResult, type CommandRunner } from '@agent-factory/application';
import { describe, expect, it } from 'vitest';
import { CommandSpawnError } from '../process/errors.ts';
import { TRANSCODE_TIMEOUT_MS } from './constants.ts';
import { EVEN_DIMENSIONS_FILTER, FfmpegTranscoder, H264_ARGUMENTS, transcodeCommand } from './ffmpegTranscoder.ts';

const RESULT: CommandResult = { exitCode: 0, stdout: '', stderr: '', durationMs: 5, timedOut: false };

class ScriptedRunner implements CommandRunner {
  readonly runs: { command: readonly string[]; cwd: string; timeoutMs: number; env: Readonly<Record<string, string>> }[] = [];
  result: CommandResult | Error = RESULT;

  run(command: readonly string[], cwd: string, timeoutMs: number, env: Readonly<Record<string, string>>): Promise<CommandResult> {
    this.runs.push({ command, cwd, timeoutMs, env });
    return this.result instanceof Error ? Promise.reject(this.result) : Promise.resolve(this.result);
  }
}

describe('transcodeCommand', () => {
  it('encodes H.264 for every player, at an even size, under nice', () => {
    expect(transcodeCommand('/in/film.webm', '/out/film.mp4')).toEqual([
      'nice',
      '-n',
      '10',
      'ffmpeg',
      '-y',
      '-i',
      '/in/film.webm',
      '-vf',
      EVEN_DIMENSIONS_FILTER,
      ...H264_ARGUMENTS,
      '/out/film.mp4',
    ]);
    expect(H264_ARGUMENTS).toEqual(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']);
  });
});

describe('FfmpegTranscoder', () => {
  it('runs ffmpeg next to the target within its time limit, with the environment it was given', async () => {
    const runner = new ScriptedRunner();
    await new FfmpegTranscoder(runner, { PATH: '/usr/bin', UNSET: undefined }).toMp4('/in/film.webm', '/out/dir/film.mp4');
    expect(runner.runs).toEqual([{ command: transcodeCommand('/in/film.webm', '/out/dir/film.mp4'), cwd: '/out/dir', timeoutMs: TRANSCODE_TIMEOUT_MS, env: { PATH: '/usr/bin' } }]);
  });

  it('fails with the end of what ffmpeg printed when it exits with an error', async () => {
    const runner = new ScriptedRunner();
    runner.result = { ...RESULT, exitCode: 1, stderr: 'line 1\nInvalid data found when processing input\n' };
    await expect(new FfmpegTranscoder(runner, {}).toMp4('/in/film.webm', '/out/film.mp4')).rejects.toThrow('ffmpeg exited with 1 on /in/film.webm: line 1 | Invalid data found when processing input');
  });

  it('fails when ffmpeg runs out of time', async () => {
    const runner = new ScriptedRunner();
    runner.result = { ...RESULT, exitCode: 143, timedOut: true };
    await expect(new FfmpegTranscoder(runner, {}).toMp4('/in/film.webm', '/out/film.mp4')).rejects.toBeInstanceOf(FilmRecordingError);
  });

  it('says that a video which is not an MP4 needs ffmpeg when it is not installed', async () => {
    const runner = new ScriptedRunner();
    runner.result = new CommandSpawnError(['nice'], new Error('spawn nice ENOENT'));
    await expect(new FfmpegTranscoder(runner, {}).toMp4('/in/film.webm', '/out/film.mp4')).rejects.toThrow('a video that is not an MP4 needs it');
  });
});
