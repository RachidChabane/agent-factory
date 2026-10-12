import { access, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  FILM_REPORT_FILE,
  FilmRecordingError,
  renderFilmCommand,
  type CommandRunner,
  type FilmRecorder,
  type FilmRecording,
  type FilmRequest,
  type FilmSettings,
} from '@agent-factory/application';
import { CommandSpawnError } from '../process/errors.ts';
import { MILLISECONDS_PER_MINUTE, VIDEO_EXTENSIONS } from './constants.ts';
import { failureOf } from './failureTail.ts';
import { largestVideo, screenshotFiles, selectScreenshots, videoFiles } from './filmMedia.ts';
import { parseReport } from './filmReportParsing.ts';
import { niced } from './niceCommand.ts';

const UTF8 = 'utf8';
const MISSING_FILE_CODE = 'ENOENT';

export interface CommandFilmRecorderSettings {
  readonly film: FilmSettings;
  /** The environment of the operator's session: the film command runs with it, with the film's own variables on top. */
  readonly operatorEnvironment: Readonly<Record<string, string | undefined>>;
}

function definedEntries(environment: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(Object.entries(environment).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])));
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, UTF8);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE) return null;
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Records a scenario by running the command the project declares, outside any sandbox, in the
 * operator's environment. The command writes a report, a video and screenshots into the output
 * directory it is given; this reads them back.
 */
export class CommandFilmRecorder implements FilmRecorder {
  private readonly runner: CommandRunner;
  private readonly settings: CommandFilmRecorderSettings;

  constructor(runner: CommandRunner, settings: CommandFilmRecorderSettings) {
    this.runner = runner;
    this.settings = settings;
  }

  async record(request: FilmRequest): Promise<FilmRecording> {
    const { film, operatorEnvironment } = this.settings;
    const command = niced(
      renderFilmCommand(film.command, { ref: request.ref, output: request.outputDirectory, scenario: request.scenario, replay: request.replayPath }),
    );
    await mkdir(request.outputDirectory, { recursive: true });
    const result = await this.run(command, film.workingDirectory, film.timeoutMs, { ...definedEntries(operatorEnvironment), ...film.environment });
    if (result.timedOut) {
      throw new FilmRecordingError(`the film command did not finish within ${Math.round(film.timeoutMs / MILLISECONDS_PER_MINUTE)} minutes and was stopped`);
    }
    if (result.exitCode !== 0) throw new FilmRecordingError(`the film command exited with ${result.exitCode}: ${failureOf(result)}`);
    return this.read(request.outputDirectory);
  }

  private async run(command: readonly string[], workingDirectory: string, timeoutMs: number, environment: Record<string, string>) {
    try {
      return await this.runner.run(command, workingDirectory, timeoutMs, environment);
    } catch (error) {
      if (error instanceof CommandSpawnError) throw new FilmRecordingError(`the film command could not be started: ${error.message}`);
      throw error;
    }
  }

  private async read(output: string): Promise<FilmRecording> {
    const reportText = await readIfPresent(join(output, FILM_REPORT_FILE));
    if (reportText === null) throw new FilmRecordingError(`the film command wrote no ${FILM_REPORT_FILE}`);
    const report = parseReport(reportText, FILM_REPORT_FILE);
    if (report.status === 'skipped') {
      throw new FilmRecordingError(`the scenario was skipped${report.reason === null ? '' : `: ${report.reason}`}`);
    }
    const videoPath = largestVideo(await videoFiles(output));
    if (videoPath === null) {
      throw new FilmRecordingError(`the film command wrote no video (${VIDEO_EXTENSIONS.join(', ')}) in its output directory`);
    }
    const screenshots = (await screenshotFiles(output)).map((file) => file.path);
    return {
      facts: report.facts,
      videoPath,
      screenshotPaths: selectScreenshots(screenshots, report.keyFrames),
      wroteReplay: await exists(join(output, this.settings.film.replayFile)),
    };
  }
}
