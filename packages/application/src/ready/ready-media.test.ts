import { describe, expect, it } from 'vitest';
import { ISSUE_NUMBER } from '../pipeline/testing/pipeline-scenario.ts';
import { FINAL_SCREENSHOT, KEY_FRAME, SCENARIO } from '../film/testing/film-fakes.ts';
import { openPullRequest, STORE_ROOT, type Film } from '../film/testing/film-world.ts';
import { readyMediaOf } from './ready-media.ts';

const SIGNAL = new AbortController().signal;

async function filmed(): Promise<Film> {
  const world = await openPullRequest();
  world.recorder.screenshots = [FINAL_SCREENSHOT, KEY_FRAME];
  const outcome = await world.behaviour.film({ issueNumber: ISSUE_NUMBER, scenario: SCENARIO, operator: 'Alex Morgan' }, SIGNAL);
  if (outcome.kind !== 'finished') throw new Error('the film failed');
  return world;
}

describe('the media of a pull request', () => {
  it('are the film of each scenario before and after with its final screenshot, then the images of its evidence', async () => {
    const world = await filmed();
    const media = readyMediaOf(await world.scenario.journal(), world.scenario.settings.evidenceCacheDirectory);
    expect(media).toEqual([
      { path: `${STORE_ROOT}/films/${SCENARIO}/before/run-1/film.webm.h264.mp4`, label: `${SCENARIO} · before · film.webm.h264.mp4` },
      { path: `${STORE_ROOT}/films/${SCENARIO}/before/screens/z-final.svg`, label: `${SCENARIO} · before · z-final.svg` },
      { path: `${STORE_ROOT}/films/${SCENARIO}/after/run-1/film.webm.h264.mp4`, label: `${SCENARIO} · after · film.webm.h264.mp4` },
      { path: `${STORE_ROOT}/films/${SCENARIO}/after/screens/z-final.svg`, label: `${SCENARIO} · after · z-final.svg` },
      { path: `${STORE_ROOT}/before/app/test-results/link.png`, label: 'evidence · before · link.png' },
      { path: `${STORE_ROOT}/after/app/test-results/link.png`, label: 'evidence · after · link.png' },
    ]);
  });

  it('leave the key frames out: only the final screenshot is linked', async () => {
    const world = await filmed();
    const labels = readyMediaOf(await world.scenario.journal(), world.scenario.settings.evidenceCacheDirectory).map((file) => file.label);
    expect(labels.some((label) => label.includes('a-key'))).toBe(false);
  });

  it('are the evidence images alone for a pull request without film', async () => {
    const world = await openPullRequest();
    const labels = readyMediaOf(await world.scenario.journal(), world.scenario.settings.evidenceCacheDirectory).map((file) => file.label);
    expect(labels).toEqual(['evidence · before · link.png', 'evidence · after · link.png']);
  });
});
