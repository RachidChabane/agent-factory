import type { InMemoryWorkspace } from '../../pipeline/testing/pipeline-fakes.ts';
import type { PipelineScenario } from '../../pipeline/testing/pipeline-scenario.ts';
import type { AgentRunActivity } from '../../runs/run-activity.ts';
import { FilmBodies } from '../film-bodies.ts';
import { FilmRecordingError } from '../film-errors.ts';
import { FilmLedger } from '../film-ledger.ts';
import { FilmMergeGuard } from '../film-merge-guard.ts';
import type { FilmFact, FilmRecorder, FilmRecording, FilmRequest, VideoTranscoder } from '../film-ports.ts';
import { FilmQueue } from '../film-queue.ts';
import type { FilmPresentation } from '../film-settings.ts';

export const MINUTE_MS = 60_000;
export const PROJECT_ID = 'storefront';
export const SCENARIO = 'checkout-flow';
export const REPLAY_FILE = 'replay.json';
export const FILM_PRESENTATION: FilmPresentation = {
  fallbackDurationMs: 20 * MINUTE_MS,
  timeZone: 'UTC',
  cockpitUrl: 'https://factory.example.test/projects/storefront',
};
export const SOURCE_VIDEO = 'run-1/film.webm';
export const MP4_VIDEO = 'run-1/film.mp4';
export const FINAL_SCREENSHOT = 'screens/z-final.svg';
export const KEY_FRAME = 'screens/a-key.png';
export const REPORT_TEXT = '{"status":"recorded"}\n';
export const REPLAY_TEXT = '{"choices":[1]}\n';

export const FACTS: readonly FilmFact[] = [
  { label: 'Items in the cart', value: '2' },
  { label: 'Order total', value: '19.90' },
];

export interface FilmServices {
  readonly ledger: FilmLedger;
  readonly bodies: FilmBodies;
  readonly queue: FilmQueue;
  readonly guard: FilmMergeGuard;
}

/** The queue, the bodies and the merge guard of a scenario's project, over the scenario's own log. */
export function filmServices(scenario: PipelineScenario, presentation: FilmPresentation = FILM_PRESENTATION): FilmServices {
  const dependencies = scenario.dependencies();
  const ledger = new FilmLedger([{ projectId: PROJECT_ID, events: scenario.events }], scenario.clock, presentation.fallbackDurationMs);
  const bodies = new FilmBodies(dependencies, { projectId: PROJECT_ID, fileLinks: scenario.settings.fileLinks, presentation }, ledger);
  return { ledger, bodies, queue: new FilmQueue(dependencies, bodies), guard: new FilmMergeGuard(ledger, PROJECT_ID, presentation) };
}

export type RecorderBehaviour = (request: FilmRequest, call: number) => Promise<void> | void;

/** Writes what a film command leaves in its output directory, into the scenario's in-memory workspace. */
export class FakeFilmRecorder implements FilmRecorder {
  readonly requests: FilmRequest[] = [];
  behaviour: RecorderBehaviour = () => undefined;
  wroteReplay = true;
  videoPath = SOURCE_VIDEO;
  screenshots: readonly string[] = [];
  facts: readonly FilmFact[] = FACTS;
  reportText = REPORT_TEXT;
  screenshotContent: (ref: string, path: string) => string = (ref, path) => `image:${ref}:${path}`;
  private readonly workspace: InMemoryWorkspace;
  private readonly storeRoot: string;

  constructor(workspace: InMemoryWorkspace, storeRoot: string) {
    this.workspace = workspace;
    this.storeRoot = storeRoot;
  }

  async record(request: FilmRequest, signal: AbortSignal): Promise<FilmRecording> {
    this.requests.push(request);
    if (signal.aborted) throw new FilmRecordingError('aborted');
    await this.behaviour(request, this.requests.length);
    const relative = request.outputDirectory.slice(this.storeRoot.length + 1);
    this.workspace.write(this.storeRoot, `${relative}/report.json`, this.reportText);
    if (this.wroteReplay) this.workspace.write(this.storeRoot, `${relative}/${REPLAY_FILE}`, REPLAY_TEXT);
    this.workspace.write(this.storeRoot, `${relative}/${this.videoPath}`, `video:${request.ref}`);
    for (const screenshot of this.screenshots) this.workspace.write(this.storeRoot, `${relative}/${screenshot}`, this.screenshotContent(request.ref, screenshot));
    return { facts: this.facts, videoPath: this.videoPath, screenshotPaths: this.screenshots, wroteReplay: this.wroteReplay };
  }
}

export class FakeVideoTranscoder implements VideoTranscoder {
  readonly conversions: { source: string; target: string }[] = [];
  private readonly workspace: InMemoryWorkspace;
  private readonly storeRoot: string;

  constructor(workspace: InMemoryWorkspace, storeRoot: string) {
    this.workspace = workspace;
    this.storeRoot = storeRoot;
  }

  toMp4(sourcePath: string, targetPath: string): Promise<void> {
    this.conversions.push({ source: sourcePath, target: targetPath });
    this.workspace.write(this.storeRoot, targetPath.slice(this.storeRoot.length + 1), `mp4:${sourcePath}`);
    return Promise.resolve();
  }
}

export class FakeRunActivity implements AgentRunActivity {
  open = false;

  hasOpenRun(): Promise<boolean> {
    return Promise.resolve(this.open);
  }
}
