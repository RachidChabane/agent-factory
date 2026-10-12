import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { BASKET_SUMMARY } from './demo-basket.ts';
import { DEMO_REPLAY_FILE, filmPhaseOf, UNAVAILABLE_SCENARIO, type DemoFilmRequest, type FilmPhase } from './demo-film-request.ts';
import { CART_SCREEN_PATH, drawScreens } from './demo-film-screens.ts';

/** The variable that sets how many seconds each run takes, so that the cockpit has time to show a film being recorded. */
export const FILM_PACE_VARIABLE = 'DEMO_FILM_SECONDS_PER_RUN';
/** The two sample videos kept next to the command: what the product looked like before the change, and after it. */
export const SAMPLE_VIDEOS: Readonly<Record<FilmPhase, string>> = { base: 'before.mp4', head: 'after.mp4' };
export const REPORT_FILE = 'report.json';
export const FILM_FILE = 'film.mp4';
export const SKIPPED_REASON = 'the test account of this scenario is locked';
const RECORDED = 'recorded';
const SKIPPED = 'skipped';

const MILLISECONDS_PER_SECOND = 1000;
const STEPS_COMPLETED = 5;
const JSON_INDENT = 2;
const UTF8 = 'utf8';
const BASE_CHOICES = [
  { step: 'Delivery', answer: 'Standard' },
  { step: 'Gift wrap', answer: 'None' },
  { step: 'Payment', answer: 'Saved card' },
] as const;

const ReplaySchema = z.object({
  scenario: z.string(),
  choices: z.array(z.object({ step: z.string(), answer: z.string() })),
});
type Replay = z.infer<typeof ReplaySchema>;

export class FilmReplayError extends Error {
  constructor(path: string, detail: string) {
    super(`the replay file ${path} cannot be replayed: ${detail}`);
    this.name = 'FilmReplayError';
  }
}

export interface DemoFilmSettings {
  /** The directory that holds the two sample videos. */
  readonly samplesDirectory: string;
  readonly secondsPerRun: number;
  readonly sleep: (milliseconds: number) => Promise<void>;
}

/** The seconds each run takes: none unless the variable names a number. */
export function secondsPerRunOf(environment: Readonly<Record<string, string | undefined>>): number {
  const value = environment[FILM_PACE_VARIABLE];
  if (value === undefined || value.trim() === '') return 0;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`${FILM_PACE_VARIABLE} must be a number of seconds, not "${value}"`);
  return seconds;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, JSON_INDENT)}\n`);
}

async function readReplay(path: string, scenario: string): Promise<Replay> {
  let replay: Replay;
  try {
    replay = ReplaySchema.parse(JSON.parse(await readFile(path, UTF8)));
  } catch (error) {
    throw new FilmReplayError(path, error instanceof Error ? error.message : String(error));
  }
  if (replay.scenario !== scenario) throw new FilmReplayError(path, `it was recorded for the scenario ${replay.scenario}, not ${scenario}`);
  return replay;
}

function recordedReport(replay: Replay | null) {
  const facts = [
    { label: 'Steps completed', value: STEPS_COMPLETED },
    { label: 'Basket', value: BASKET_SUMMARY },
    ...(replay === null ? [] : [{ label: 'Choices replayed', value: replay.choices.length }]),
  ];
  return { status: RECORDED, facts, keyFrames: [CART_SCREEN_PATH] };
}

/**
 * Records a scenario the way the product's own film tool would, from the two sample videos: the first run (no replay
 * file) is the base and leaves the choices it made, the second replays them and is the head. The scenario
 * `UNAVAILABLE_SCENARIO` reports itself skipped.
 */
export async function recordDemoFilm(request: DemoFilmRequest, settings: DemoFilmSettings): Promise<void> {
  const output = request.outputDirectory;
  if (request.scenario === UNAVAILABLE_SCENARIO) {
    await writeJson(join(output, REPORT_FILE), { status: SKIPPED, reason: SKIPPED_REASON });
    return;
  }
  const phase = filmPhaseOf(request);
  const replay = request.replayPath === null ? null : await readReplay(request.replayPath, request.scenario);
  await settings.sleep(settings.secondsPerRun * MILLISECONDS_PER_SECOND);
  await mkdir(output, { recursive: true });
  await copyFile(join(settings.samplesDirectory, SAMPLE_VIDEOS[phase]), join(output, FILM_FILE));
  for (const drawing of drawScreens(phase)) {
    await mkdir(dirname(join(output, drawing.path)), { recursive: true });
    await writeFile(join(output, drawing.path), drawing.svg);
  }
  if (replay === null) await writeJson(join(output, DEMO_REPLAY_FILE), { scenario: request.scenario, choices: BASE_CHOICES });
  await writeJson(join(output, REPORT_FILE), recordedReport(replay));
}
