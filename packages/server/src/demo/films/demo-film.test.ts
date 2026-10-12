import fc from 'fast-check';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FILM_FILE, FILM_PACE_VARIABLE, FilmReplayError, recordDemoFilm, REPORT_FILE, secondsPerRunOf, SKIPPED_REASON, type DemoFilmSettings } from './demo-film.ts';
import { DEMO_REPLAY_FILE, UNAVAILABLE_SCENARIO, type DemoFilmRequest } from './demo-film-request.ts';
import { CART_SCREEN_PATH, SUMMARY_SCREEN_PATH } from './demo-film-screens.ts';

const BEFORE_SAMPLE = 'the base, as it looked before the change';
const AFTER_SAMPLE = 'the head, as it looks after the change';
const SCENARIO = 'checkout-flow';
const MILLISECONDS_PER_SECOND = 1000;

describe('recordDemoFilm', () => {
  let samples = '';
  let workspace = '';
  let slept: number[] = [];
  let videoWrittenWhileWaiting: boolean[] = [];

  const baseRequest = (): DemoFilmRequest => ({ ref: 'abc1234', outputDirectory: join(workspace, 'base'), scenario: SCENARIO, replayPath: null });
  const headRequest = (replayPath = join(workspace, 'base', DEMO_REPLAY_FILE)): DemoFilmRequest => ({
    ref: 'def5678',
    outputDirectory: join(workspace, 'head'),
    scenario: SCENARIO,
    replayPath,
  });
  const settings = (secondsPerRun = 0): DemoFilmSettings => ({
    samplesDirectory: samples,
    secondsPerRun,
    sleep: (milliseconds) => {
      slept.push(milliseconds);
      videoWrittenWhileWaiting.push(existsSync(join(workspace, 'base', FILM_FILE)) || existsSync(join(workspace, 'head', FILM_FILE)));
      return Promise.resolve();
    },
  });
  const read = async (...path: string[]): Promise<string> => readFile(join(workspace, ...path), 'utf8');
  const reportOf = async (phase: 'base' | 'head') => JSON.parse(await read(phase, REPORT_FILE)) as Record<string, unknown>;

  beforeEach(async () => {
    samples = await mkdtemp(join(tmpdir(), 'demo-film-samples-'));
    workspace = await mkdtemp(join(tmpdir(), 'demo-film-output-'));
    slept = [];
    videoWrittenWhileWaiting = [];
    await writeFile(join(samples, 'before.mp4'), BEFORE_SAMPLE);
    await writeFile(join(samples, 'after.mp4'), AFTER_SAMPLE);
  });
  afterEach(async () => {
    await rm(samples, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  });

  it('records the base from the first sample, leaves the choices it made, and reports what it showed', async () => {
    await recordDemoFilm(baseRequest(), settings());

    expect(await read('base', FILM_FILE)).toBe(BEFORE_SAMPLE);
    expect(JSON.parse(await read('base', DEMO_REPLAY_FILE))).toEqual({
      scenario: SCENARIO,
      choices: [
        { step: 'Delivery', answer: 'Standard' },
        { step: 'Gift wrap', answer: 'None' },
        { step: 'Payment', answer: 'Saved card' },
      ],
    });
    expect(await reportOf('base')).toEqual({
      status: 'recorded',
      facts: [
        { label: 'Steps completed', value: 5 },
        { label: 'Basket', value: '3 items, $59.97' },
      ],
      keyFrames: [CART_SCREEN_PATH],
    });
    expect(await read('base', SUMMARY_SCREEN_PATH)).toContain('Storefront - Before');
    expect(await read('base', CART_SCREEN_PATH)).toContain('Your cart');
  });

  it('records the head from the second sample, replaying the choices of the first run and reporting how many', async () => {
    await recordDemoFilm(baseRequest(), settings());
    await recordDemoFilm(headRequest(), settings());

    expect(await read('head', FILM_FILE)).toBe(AFTER_SAMPLE);
    expect(existsSync(join(workspace, 'head', DEMO_REPLAY_FILE))).toBe(false);
    expect(await reportOf('head')).toMatchObject({ status: 'recorded', facts: expect.arrayContaining([{ label: 'Choices replayed', value: 3 }]) });
    expect(await read('head', SUMMARY_SCREEN_PATH)).toContain('Storefront - After');
  });

  it('refuses to replay a file that is missing, that is not a replay, or that was recorded for another scenario', async () => {
    await expect(recordDemoFilm(headRequest(join(workspace, 'nowhere.json')), settings())).rejects.toThrow(FilmReplayError);

    await writeFile(join(workspace, 'broken.json'), '{not json');
    await expect(recordDemoFilm(headRequest(join(workspace, 'broken.json')), settings())).rejects.toThrow('cannot be replayed');

    await writeFile(join(workspace, 'other.json'), JSON.stringify({ scenario: 'order-history', choices: [] }));
    await expect(recordDemoFilm(headRequest(join(workspace, 'other.json')), settings())).rejects.toThrow('it was recorded for the scenario order-history, not checkout-flow');
    expect(existsSync(join(workspace, 'head', FILM_FILE))).toBe(false);
  });

  it('reports the unavailable scenario as skipped, with its reason, without a video or a replay file', async () => {
    await recordDemoFilm({ ...baseRequest(), scenario: UNAVAILABLE_SCENARIO }, settings(4));

    expect(await reportOf('base')).toEqual({ status: 'skipped', reason: SKIPPED_REASON });
    expect(existsSync(join(workspace, 'base', FILM_FILE))).toBe(false);
    expect(existsSync(join(workspace, 'base', DEMO_REPLAY_FILE))).toBe(false);
    expect(slept).toEqual([]);
  });

  it('takes the seconds it is given before it writes anything', async () => {
    await recordDemoFilm(baseRequest(), settings(2.5));

    expect(slept).toEqual([2.5 * MILLISECONDS_PER_SECOND]);
    expect(videoWrittenWhileWaiting).toEqual([false]);
    expect(await read('base', FILM_FILE)).toBe(BEFORE_SAMPLE);
  });
});

describe('secondsPerRunOf', () => {
  it('is no wait unless the variable names a number', () => {
    expect(secondsPerRunOf({})).toBe(0);
    expect(secondsPerRunOf({ [FILM_PACE_VARIABLE]: '  ' })).toBe(0);
  });

  it('reads the number of seconds', () => {
    expect(secondsPerRunOf({ [FILM_PACE_VARIABLE]: '4' })).toBe(4);
    expect(secondsPerRunOf({ [FILM_PACE_VARIABLE]: '0.5' })).toBe(0.5);
  });

  it('refuses what is not a number of seconds', () => {
    for (const value of ['soon', '-1', 'Infinity', 'NaN']) {
      expect(() => secondsPerRunOf({ [FILM_PACE_VARIABLE]: value }), value).toThrow(`${FILM_PACE_VARIABLE} must be a number of seconds, not "${value}"`);
    }
  });

  it('reads back any pace written as a number', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 3600 }), (seconds) => secondsPerRunOf({ [FILM_PACE_VARIABLE]: String(seconds) }) === seconds));
  });
});
