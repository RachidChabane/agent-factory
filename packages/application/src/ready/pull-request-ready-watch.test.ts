import { describe, expect, it } from 'vitest';
import { OperatorNotifications } from '../notifications/operator-notifications.ts';
import { PIPELINE_EVENTS } from '../pipeline/journal-events.ts';
import { isAnnouncedReady } from '../pipeline/pipeline-journal.ts';
import { ISSUE_NUMBER } from '../pipeline/testing/pipeline-scenario.ts';
import type { FilmOrder } from '../film/film-order.ts';
import { FINAL_SCREENSHOT, MINUTE_MS, SCENARIO } from '../film/testing/film-fakes.ts';
import { openPullRequest, STORE_ROOT, type Film } from '../film/testing/film-world.ts';
import type { CheckRunSummary } from '../ports.ts';
import { MediaPublisher } from './media-publisher.ts';
import { PullRequestReadyWatch, type PullRequestReadySettings } from './pull-request-ready-watch.ts';
import { ContentFingerprints, FakeUploader, FILES_HOST, MemoryLinkCache, RecordingNotifier } from './testing/ready-fakes.ts';

const ORDER: FilmOrder = { issueNumber: ISSUE_NUMBER, scenario: SCENARIO, operator: 'Alex Morgan' };
const SETTLE_MS = 2 * MINUTE_MS;
const RETRY_MS = 5 * MINUTE_MS;
const SIGNAL = new AbortController().signal;
const check = (conclusion: CheckRunSummary['conclusion'], name = 'ci'): CheckRunSummary => ({ name, conclusion, url: `https://ci.example/${name}`, durationMs: null });
const GREEN = [check('success')];
const RUNNING = [check('pending')];

interface Setup {
  readonly world: Film;
  readonly notifier: RecordingNotifier;
  readonly uploader: FakeUploader;
  readonly cache: MemoryLinkCache;
  readonly warnings: string[];
  readonly watch: PullRequestReadyWatch;
  watchAgain(overrides?: Partial<PullRequestReadySettings>): PullRequestReadyWatch;
}

async function setup(declaredFilms: readonly string[] = [], overrides: Partial<PullRequestReadySettings> = {}, publishing = true): Promise<Setup> {
  const world = await openPullRequest(declaredFilms);
  const notifier = new RecordingNotifier();
  const uploader = new FakeUploader();
  const cache = new MemoryLinkCache();
  const warnings: string[] = [];
  const log = { info: () => undefined, warn: (line: string) => void warnings.push(line) };
  const publisher = new MediaPublisher({ uploader, fingerprints: new ContentFingerprints(), cache, log });
  const { scenario } = world;
  const build = (settings: Partial<PullRequestReadySettings>): PullRequestReadyWatch =>
    new PullRequestReadyWatch(
      {
        events: scenario.events,
        states: scenario.states,
        github: scenario.github,
        clock: scenario.clock,
        log,
        notifications: new OperatorNotifications(notifier, 'https://factory.example.test/projects/storefront', log),
        publisher: () => (publishing ? publisher : null),
      },
      { evidenceCacheDirectory: scenario.settings.evidenceCacheDirectory, filming: true, checksSettleMs: SETTLE_MS, deliveryRetryMs: RETRY_MS, ...settings },
    );
  return { world, notifier, uploader, cache, warnings, watch: build(overrides), watchAgain: (again = overrides) => build(again) };
}

function advance(world: Film, milliseconds: number): void {
  const { clock } = world.scenario;
  clock.set(new Date(clock.now().getTime() + milliseconds));
}

async function film(world: Film): Promise<void> {
  world.recorder.screenshots = [FINAL_SCREENSHOT];
  const outcome = await world.behaviour.film(ORDER, SIGNAL);
  if (outcome.kind !== 'finished') throw new Error('the film failed');
}

describe('PullRequestReadyWatch', () => {
  it('tells nothing while a declared film is still to be recorded', async () => {
    const { world, watch, notifier } = await setup([SCENARIO]);
    world.scenario.github.checkRuns = GREEN;
    expect(await watch.scan(SIGNAL)).toEqual([]);
    expect(notifier.sent).toEqual([]);
  });

  it('tells once per head when the checks passed, with the links of the films labelled by scenario, phase and file', async () => {
    const { world, watch, watchAgain, notifier, uploader } = await setup([SCENARIO]);
    await film(world);
    world.scenario.github.checkRuns = RUNNING;
    expect(await watch.scan(SIGNAL)).toEqual([]);

    world.scenario.github.checkRuns = GREEN;
    const announced = await watch.scan(SIGNAL);

    const journal = await world.scenario.journal();
    const head = journal.pushedHead ?? '';
    expect(head).not.toBe(world.head);
    expect(announced).toEqual([
      {
        pullRequestNumber: 100,
        headSha: head,
        links: [
          { label: `${SCENARIO} · before · film.webm.h264.mp4`, url: `${FILES_HOST}/film.webm.h264.mp4` },
          { label: `${SCENARIO} · before · z-final.svg`, url: `${FILES_HOST}/z-final.svg` },
          { label: `${SCENARIO} · after · film.webm.h264.mp4`, url: `${FILES_HOST}/film.webm.h264.mp4` },
          { label: `${SCENARIO} · after · z-final.svg`, url: `${FILES_HOST}/z-final.svg` },
          { label: 'evidence · before · link.png', url: `${FILES_HOST}/link.png` },
          { label: 'evidence · after · link.png', url: `${FILES_HOST}/link.png` },
        ],
        failures: [],
      },
    ]);
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]).toMatchObject({ title: 'Pull request #100 is ready to merge', link: 'https://factory.example.test/projects/storefront/pull-requests/100' });
    expect(notifier.sent[0]?.body).toContain(`Films recorded: ${SCENARIO}.`);
    expect(notifier.sent[0]?.media).toEqual(announced[0]?.links);
    expect(uploader.uploads[0]).toBe(`${STORE_ROOT}/films/${SCENARIO}/before/run-1/film.webm.h264.mp4`);
    expect(isAnnouncedReady(journal, head)).toBe(true);

    expect(await watch.scan(SIGNAL)).toEqual([]);
    expect(await watchAgain().scan(SIGNAL)).toEqual([]);
    expect(notifier.sent).toHaveLength(1);
  });

  it('tells a pull request without film once its checks passed, with the links of its evidence images', async () => {
    const { world, watch, notifier } = await setup();
    world.scenario.github.checkRuns = GREEN;
    const [announced] = await watch.scan(SIGNAL);
    expect(announced?.links.map((link) => link.label)).toEqual(['evidence · before · link.png', 'evidence · after · link.png']);
    expect(notifier.sent[0]?.body).toContain('No film was recorded.');
  });

  it('holds the notice while a film has failed, until a later film of that scenario succeeds', async () => {
    const { world, watch, notifier } = await setup([SCENARIO]);
    world.scenario.github.checkRuns = GREEN;
    await world.services.queue.order(ORDER);
    await world.services.queue.fail(ORDER, 'the browser crashed');
    expect(await watch.scan(SIGNAL)).toEqual([]);
    expect(notifier.sent).toEqual([]);

    await world.services.queue.order(ORDER);
    expect(await watch.scan(SIGNAL)).toEqual([]);
    await film(world);
    expect(await watch.scan(SIGNAL)).toHaveLength(1);
    expect(notifier.sent).toHaveLength(1);
  });

  it('tells again for a new head, for example the one a later film commits', async () => {
    const { world, watch, notifier } = await setup([SCENARIO]);
    await film(world);
    world.scenario.github.checkRuns = GREEN;
    await watch.scan(SIGNAL);
    world.recorder.reportText = '{"status":"recorded","note":"another outcome"}\n';
    await film(world);

    expect(await watch.scan(SIGNAL)).toHaveLength(1);

    expect(notifier.sent).toHaveLength(2);
    expect(new Set((await world.scenario.journal()).readyAnnouncements.map((announcement) => announcement.headSha)).size).toBe(2);
  });

  it('uploads the media of a head once, even when the notice has to be sent again', async () => {
    const { world, watch, notifier, uploader } = await setup([SCENARIO]);
    await film(world);
    world.scenario.github.checkRuns = GREEN;
    notifier.failures = 1;

    expect(await watch.scan(SIGNAL)).toEqual([]);
    const uploaded = uploader.uploads.length;
    expect(uploaded).toBeGreaterThan(0);
    expect((await world.scenario.journal()).readyAnnouncements).toEqual([]);
    expect(await watch.scan(SIGNAL)).toEqual([]);
    advance(world, RETRY_MS);
    expect(await watch.scan(SIGNAL)).toHaveLength(1);

    expect(uploader.uploads).toHaveLength(uploaded);
    expect(notifier.sent).toHaveLength(1);
  });

  it('leaves out the link of a file that could not be uploaded, says why, and still tells', async () => {
    const { world, watch, notifier, uploader, warnings } = await setup([SCENARIO]);
    await film(world);
    world.scenario.github.checkRuns = GREEN;
    uploader.failures.set('after/run-1/film.webm.h264.mp4', 'the upload command exited with 1: quota exceeded');

    const [announced] = await watch.scan(SIGNAL);

    expect(announced?.failures).toEqual([{ label: `${SCENARIO} · after · film.webm.h264.mp4`, reason: 'the upload command exited with 1: quota exceeded' }]);
    expect(announced?.links.map((link) => link.label)).not.toContain(`${SCENARIO} · after · film.webm.h264.mp4`);
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]?.media).toEqual(announced?.links);
    expect(warnings).toContain(`${SCENARIO} · after · film.webm.h264.mp4 was not uploaded: the upload command exited with 1: quota exceeded`);
  });

  it('tells without links when the project declares no upload command', async () => {
    const { world, watch, notifier } = await setup([SCENARIO], {}, false);
    await film(world);
    world.scenario.github.checkRuns = GREEN;
    const [announced] = await watch.scan(SIGNAL);
    expect(announced).toMatchObject({ links: [], failures: [] });
    expect(notifier.sent[0]?.media).toEqual([]);
  });

  it('waits for the grace period before it trusts an empty list of checks', async () => {
    const { world, watch, notifier } = await setup();
    world.scenario.github.checkRuns = [];
    expect(await watch.scan(SIGNAL)).toEqual([]);
    advance(world, SETTLE_MS - 1);
    expect(await watch.scan(SIGNAL)).toEqual([]);
    advance(world, 1);
    expect(await watch.scan(SIGNAL)).toHaveLength(1);
    expect(notifier.sent).toHaveLength(1);
  });

  it('tells nothing while a required check fails, and counts a check that also fails on the base branch as passed', async () => {
    const { world, watch, notifier } = await setup();
    world.scenario.github.checkRuns = [check('failure', 'lint'), check('success', 'unit')];
    expect(await watch.scan(SIGNAL)).toEqual([]);
    world.scenario.github.baseCheckRuns = [check('failure', 'lint')];
    expect(await watch.scan(SIGNAL)).toHaveLength(1);
    expect(notifier.sent).toHaveLength(1);
  });

  it('skips a pull request whose head moved on the forge, and one already merged', async () => {
    const { world, watch, notifier } = await setup();
    world.scenario.github.checkRuns = GREEN;
    await world.scenario.events.append(PIPELINE_EVENTS.branchPushed, `issue/${ISSUE_NUMBER}`, { headSha: 'a-head-the-forge-does-not-know' });
    expect(await watch.scan(SIGNAL)).toEqual([]);
    await world.scenario.events.append(PIPELINE_EVENTS.pullRequestMerged, `issue/${ISSUE_NUMBER}`, { mergeSha: 'merged' });
    expect(await watch.scan(SIGNAL)).toEqual([]);
    expect(notifier.sent).toEqual([]);
  });

  it('does not wait for films when the project films nothing', async () => {
    const { world, watch } = await setup([SCENARIO], { filming: false });
    world.scenario.github.checkRuns = GREEN;
    expect(await watch.scan(SIGNAL)).toHaveLength(1);
  });

  it('records nothing when the factory is stopping', async () => {
    const { world, watch, notifier } = await setup();
    world.scenario.github.checkRuns = GREEN;
    const stopping = new AbortController();
    stopping.abort();
    expect(await watch.scan(stopping.signal)).toEqual([]);
    expect(notifier.sent).toEqual([]);
    expect((await world.scenario.journal()).readyAnnouncements).toEqual([]);
  });

  it('holds off after a forge error, and says so in the log instead of telling the operator', async () => {
    const { world, watch, notifier, warnings } = await setup();
    world.scenario.github.checkRuns = GREEN;
    const failing = world.scenario.github;
    const original = failing.checks.bind(failing);
    failing.checks = () => Promise.reject(new Error('the forge answered HTTP 502'));
    expect(await watch.scan(SIGNAL)).toEqual([]);
    expect(warnings).toEqual(['the ready notice of issue #42 was not sent: the forge answered HTTP 502']);
    failing.checks = original;
    expect(await watch.scan(SIGNAL)).toEqual([]);
    advance(world, RETRY_MS);
    expect(await watch.scan(SIGNAL)).toHaveLength(1);
    expect(notifier.sent).toHaveLength(1);
  });
});
