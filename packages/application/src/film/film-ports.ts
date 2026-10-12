export interface FilmRequest {
  /** The commit to record. */
  readonly ref: string;
  /** An empty directory the recording writes its report, video and screenshots into. */
  readonly outputDirectory: string;
  readonly scenario: string;
  /** The replay file of the first recording, for the second one; null for the first. */
  readonly replayPath: string | null;
}

/** One line the report gives to the pull request. */
export interface FilmFact {
  readonly label: string;
  readonly value: string;
}

export interface FilmRecording {
  readonly facts: readonly FilmFact[];
  /** The film: the largest video the recording wrote, relative to the output directory. */
  readonly videoPath: string;
  /** Relative to the output directory: the final screenshot first, then the key frames the report names. */
  readonly screenshotPaths: readonly string[];
  /** Whether the recording wrote the replay file. */
  readonly wroteReplay: boolean;
}

/** Records one scenario at one commit. */
export interface FilmRecorder {
  record(request: FilmRequest, signal: AbortSignal): Promise<FilmRecording>;
}

/** Turns a video the browser or the tool wrote into an MP4 that plays everywhere. */
export interface VideoTranscoder {
  toMp4(sourcePath: string, targetPath: string, signal: AbortSignal): Promise<void>;
}

/** What a recording writes in its output directory to say how it went. */
export const FILM_REPORT_FILE = 'report.json';
