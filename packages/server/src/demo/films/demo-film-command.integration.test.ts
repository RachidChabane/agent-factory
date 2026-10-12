import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommandFilmRecorder, SpawnCommandRunner } from '@agent-factory/adapters';
import { FilmRecordingError, type FilmRequest, type FilmSettings } from '@agent-factory/application';
import { projectOf } from '../../config/agent-factory-config.ts';
import { resolvedConfiguration } from '../story/testing/demo-configuration.ts';
import { STOREFRONT_ID } from '../demo-projects.ts';
import { DEMO_FILMS_DIRECTORY } from '../demo-paths.ts';
import { FILM_PACE_VARIABLE, SAMPLE_VIDEOS, SKIPPED_REASON } from './demo-film.ts';
import { DEMO_REPLAY_FILE, UNAVAILABLE_SCENARIO } from './demo-film-request.ts';
import { CART_SCREEN_PATH, SUMMARY_SCREEN_PATH } from './demo-film-screens.ts';

const SCENARIO = 'checkout-flow';
const NO_WAIT = '0';
const KILL_GRACE_MS = 200;

function demoFilmSettings(): FilmSettings {
  const films = projectOf(resolvedConfiguration(), STOREFRONT_ID).evidence.films;
  if (films === null) throw new Error('the demonstration declares no film command for the storefront');
  return { ...films, environment: { ...films.environment, [FILM_PACE_VARIABLE]: NO_WAIT } };
}

/** The film command of the demonstration, run by the adapter the factory records films with, from the configuration the demonstration ships. */
describe('the film command of the demonstration, run as the factory runs it', () => {
  let workspace = '';
  const recorder = new CommandFilmRecorder(new SpawnCommandRunner({ killGraceMs: KILL_GRACE_MS }), {
    film: demoFilmSettings(),
    operatorEnvironment: { PATH: process.env['PATH'] },
  });

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'demo-film-command-'));
  });
  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  const request = (phase: string, scenario: string, replayPath: string | null): FilmRequest => ({
    ref: `${phase}-commit`,
    outputDirectory: join(workspace, scenario, phase),
    scenario,
    replayPath,
  });
  const sample = (file: string): Promise<Buffer> => readFile(join(DEMO_FILMS_DIRECTORY, file));

  it('films the base and then the head, which replays what the base chose', async () => {
    const base = await recorder.record(request('base', SCENARIO, null));
    expect(base).toEqual({
      facts: [
        { label: 'Steps completed', value: '5' },
        { label: 'Basket', value: '3 items, $59.97' },
      ],
      videoPath: 'film.mp4',
      screenshotPaths: [SUMMARY_SCREEN_PATH, CART_SCREEN_PATH],
      wroteReplay: true,
    });
    expect(await readFile(join(workspace, SCENARIO, 'base', base.videoPath))).toEqual(await sample(SAMPLE_VIDEOS.base));

    const head = await recorder.record(request('head', SCENARIO, join(workspace, SCENARIO, 'base', DEMO_REPLAY_FILE)));
    expect(head.facts).toContainEqual({ label: 'Choices replayed', value: '3' });
    expect(head.wroteReplay).toBe(false);
    expect(await readFile(join(workspace, SCENARIO, 'head', head.videoPath))).toEqual(await sample(SAMPLE_VIDEOS.head));
  });

  it('fails the film of the unavailable scenario with the reason the command gives', async () => {
    await expect(recorder.record(request('base', UNAVAILABLE_SCENARIO, null))).rejects.toThrow(FilmRecordingError);
    await expect(recorder.record(request('base', UNAVAILABLE_SCENARIO, null))).rejects.toThrow(`the scenario was skipped: ${SKIPPED_REASON}`);
  });

  it('fails the film of a head whose replay file is missing, with what the command printed', async () => {
    await expect(recorder.record(request('head', 'no-replay', join(workspace, 'nowhere', DEMO_REPLAY_FILE)))).rejects.toThrow(/the film command exited with 1: .*cannot be replayed/);
  });
});
