import { dirname } from 'node:path';
import { FilmRecordingError, type CommandRunner, type VideoTranscoder } from '@agent-factory/application';
import { CommandSpawnError } from '../process/errors.ts';
import { FFMPEG_EXECUTABLE, TRANSCODE_TIMEOUT_MS } from './constants.ts';
import { failureTail } from '../process/failureTail.ts';
import { niced } from '../process/niceCommand.ts';

/** H.264 wants an even width and height. */
export const EVEN_DIMENSIONS_FILTER = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
export const H264_ARGUMENTS: readonly string[] = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];

export function transcodeCommand(source: string, target: string): readonly string[] {
  return niced([FFMPEG_EXECUTABLE, '-y', '-i', source, '-vf', EVEN_DIMENSIONS_FILTER, ...H264_ARGUMENTS, target]);
}

/** Turns a video that is not an MP4 into an H.264 MP4 with `ffmpeg`, at a low priority and within a time limit. */
export class FfmpegTranscoder implements VideoTranscoder {
  private readonly runner: CommandRunner;
  private readonly environment: Readonly<Record<string, string>>;

  constructor(runner: CommandRunner, environment: Readonly<Record<string, string | undefined>>) {
    this.runner = runner;
    this.environment = Object.fromEntries(Object.entries(environment).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])));
  }

  async toMp4(sourcePath: string, targetPath: string): Promise<void> {
    const result = await this.run(transcodeCommand(sourcePath, targetPath), dirname(targetPath));
    if (result.timedOut) throw new FilmRecordingError(`transcoding ${sourcePath} did not finish in time`);
    if (result.exitCode !== 0) throw new FilmRecordingError(`${FFMPEG_EXECUTABLE} exited with ${result.exitCode} on ${sourcePath}: ${failureTail(result.stderr)}`);
  }

  private async run(command: readonly string[], workingDirectory: string) {
    try {
      return await this.runner.run(command, workingDirectory, TRANSCODE_TIMEOUT_MS, this.environment);
    } catch (error) {
      if (error instanceof CommandSpawnError) {
        throw new FilmRecordingError(`${FFMPEG_EXECUTABLE} could not be started, and a video that is not an MP4 needs it: ${error.message}`);
      }
      throw error;
    }
  }
}
