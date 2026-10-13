import { describe, expect, it } from 'vitest';
import type { EvidenceLimits } from '@agent-factory/domain';
import { PIPELINE_EVENTS } from '../pipeline/journal-events.ts';
import { loadJournal } from '../pipeline/pipeline-journal.ts';
import { ISSUE_NUMBER, type PipelineScenario } from '../pipeline/testing/pipeline-scenario.ts';
import { FilmDeferredError, FilmRefusedError } from './film-errors.ts';
import type { FilmOrder } from './film-order.ts';
import { FILM_SECTION_HEADING } from './film-section.ts';
import { FINAL_SCREENSHOT, KEY_FRAME, MP4_VIDEO, REPLAY_FILE, SCENARIO, SOURCE_VIDEO } from './testing/film-fakes.ts';
import { behaviourOf, openPullRequest, STORE_ROOT } from './testing/film-world.ts';

const ORDER: FilmOrder = { issueNumber: ISSUE_NUMBER, scenario: SCENARIO, operator: 'Alex Morgan' };
const BRANCH_DIRECTORY = `.evidence/${ISSUE_NUMBER}/films/${SCENARIO}`;
const SIGNAL = new AbortController().signal;

async function filmEvents(scenario: PipelineScenario): Promise<readonly string[]> {
  const events = await scenario.events.read(`issue/${ISSUE_NUMBER}`, 0);
  return events.filter((event) => event.type.startsWith('pipeline.film-')).map((event) => event.type);
}

describe('FilmBehaviour', () => {
  it('records the base then the head with a replay, commits both on the branch and pushes them', async () => {
    const { scenario, recorder, transcoder, behaviour } = await openPullRequest();
    const worktree = scenario.worktree();
    recorder.screenshots = [FINAL_SCREENSHOT, KEY_FRAME];

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind).toBe('finished');
    expect(recorder.requests).toEqual([
      { ref: worktree.baseSha, outputDirectory: `${STORE_ROOT}/films/${SCENARIO}/before`, scenario: SCENARIO, replayPath: null },
      { ref: expect.any(String), outputDirectory: `${STORE_ROOT}/films/${SCENARIO}/after`, scenario: SCENARIO, replayPath: `${STORE_ROOT}/films/${SCENARIO}/before/${REPLAY_FILE}` },
    ]);
    expect(transcoder.conversions.map((conversion) => conversion.source)).toEqual([
      `${STORE_ROOT}/films/${SCENARIO}/before/${SOURCE_VIDEO}`,
      `${STORE_ROOT}/films/${SCENARIO}/after/${SOURCE_VIDEO}`,
    ]);
    const tree = scenario.workspace.tree(worktree.path);
    for (const phase of ['before', 'after']) {
      expect(tree.has(`${BRANCH_DIRECTORY}/${phase}.mp4`)).toBe(true);
      expect(tree.has(`${BRANCH_DIRECTORY}/${phase}-report.json`)).toBe(true);
      expect(tree.has(`${BRANCH_DIRECTORY}/${phase}.svg`)).toBe(true);
      expect(tree.has(`${BRANCH_DIRECTORY}/${phase}-frame-1.png`)).toBe(true);
    }
    const commit = scenario.sourceControl.history(worktree).at(-1);
    expect(commit?.message).toBe(`chore(evidence): add behaviour films of scenario ${SCENARIO} for #${ISSUE_NUMBER}`);
    expect(scenario.sourceControl.pushedHead(worktree.branch)).toBe(commit?.sha);
    expect(await filmEvents(scenario)).toEqual([
      PIPELINE_EVENTS.filmQueued,
      PIPELINE_EVENTS.filmStarted,
      PIPELINE_EVENTS.filmStageEntered,
      PIPELINE_EVENTS.filmStageEntered,
      PIPELINE_EVENTS.filmCommitted,
      PIPELINE_EVENTS.filmPushed,
      PIPELINE_EVENTS.filmFinished,
    ]);
    const journal = await loadJournal(scenario.events, ISSUE_NUMBER);
    expect(journal.films).toHaveLength(1);
    expect(journal.films[0]?.commitSha).toBe(commit?.sha);
    expect(journal.pushedHead).toBe(commit?.sha);
    expect(journal.lastCommitSha).toBe(commit?.sha);
    expect(journal.filmOrders.map((order) => order.status)).toEqual(['finished']);
  });

  it('puts the recordings in the pull request body at the commit that holds them', async () => {
    const { scenario, behaviour } = await openPullRequest();

    const outcome = await behaviour.film(ORDER, SIGNAL);

    const body = scenario.github.bodyUpdates.at(-1)?.body ?? '';
    expect(outcome.kind === 'finished' ? outcome.commitSha : '').not.toBe('');
    expect(body).toContain(`## ${FILM_SECTION_HEADING}`);
    expect(body).toContain(`### Scenario \`${SCENARIO}\``);
    expect(body).toContain(`/blob/${outcome.kind === 'finished' ? outcome.commitSha : ''}/${BRANCH_DIRECTORY}/before.mp4`);
    expect(body).toContain('- Items in the cart: 2');
  });

  it('transcodes a video that is not an MP4 and keeps an MP4 as it is', async () => {
    const webm = await openPullRequest();
    await webm.behaviour.film(ORDER, SIGNAL);
    expect(webm.transcoder.conversions).toHaveLength(2);

    const mp4 = await openPullRequest();
    mp4.recorder.videoPath = MP4_VIDEO;
    await mp4.behaviour.film(ORDER, SIGNAL);

    expect(mp4.transcoder.conversions).toEqual([]);
    const tree = mp4.scenario.workspace.tree(mp4.scenario.worktree().path);
    expect(tree.get(`${BRANCH_DIRECTORY}/before.mp4`)).toBe(`video:${mp4.scenario.worktree().baseSha}`);
  });

  it('films the head of the code, not the commit an earlier film added', async () => {
    const { scenario, recorder, behaviour, head } = await openPullRequest();
    await behaviour.film(ORDER, SIGNAL);
    await behaviour.film({ ...ORDER, scenario: 'order-history' }, SIGNAL);

    const refs = recorder.requests.map((request) => request.ref);
    expect(refs[3]).toBe(head);
    expect(refs[1]).toBe(head);
    expect((await loadJournal(scenario.events, ISSUE_NUMBER)).films.map((film) => film.scenario)).toEqual([SCENARIO, 'order-history']);
  });

  it('needs no replay file when the command replays nothing', async () => {
    const world = await openPullRequest();
    world.recorder.wroteReplay = false;
    const behaviour = behaviourOf(world.scenario, world, null);

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind).toBe('finished');
    expect(world.recorder.requests.map((request) => request.replayPath)).toEqual([null, null]);
  });

  it('fails the film, with nothing committed or pushed, when the base recording wrote no replay file', async () => {
    const { scenario, recorder, behaviour } = await openPullRequest();
    const worktree = scenario.worktree();
    const pushes = scenario.sourceControl.pushes.length;
    recorder.wroteReplay = false;

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome).toEqual({
      kind: 'failed',
      issueNumber: ISSUE_NUMBER,
      scenario: SCENARIO,
      reason: `the base recording wrote no ${REPLAY_FILE}, so the head recording cannot replay it`,
    });
    expect(recorder.requests).toHaveLength(1);
    expect(scenario.sourceControl.pushes).toHaveLength(pushes);
    expect(await scenario.sourceControl.isClean(worktree)).toBe(true);
    expect((await loadJournal(scenario.events, ISSUE_NUMBER)).filmOrders[0]?.status).toBe('failed');
  });

  it('fails the film when the recorder fails, with its reason', async () => {
    const { scenario, recorder, behaviour } = await openPullRequest();
    recorder.behaviour = () => {
      throw new Error('the film command exited with 2: the session expired');
    };

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome).toMatchObject({ kind: 'failed', reason: 'the film command exited with 2: the session expired' });
    expect(await filmEvents(scenario)).toEqual([PIPELINE_EVENTS.filmQueued, PIPELINE_EVENTS.filmStarted, PIPELINE_EVENTS.filmFailed]);
  });

  it('commits nothing and pushes nothing when a report holds a secret of the operator', async () => {
    const { scenario, recorder, behaviour } = await openPullRequest();
    const worktree = scenario.worktree();
    const pushes = scenario.sourceControl.pushes.length;
    const history = scenario.sourceControl.history(worktree).length;
    scenario.secrets.secrets = [{ source: 'keychain item deploy-key', value: 'tok_live_123456789' }];
    recorder.reportText = '{"status":"recorded","note":"signed in with tok_live_123456789"}\n';

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind).toBe('failed');
    expect(outcome.kind === 'failed' ? outcome.reason : '').toContain('secret scan refused');
    expect(outcome.kind === 'failed' ? outcome.reason : '').not.toContain('tok_live_123456789');
    expect(scenario.sourceControl.history(worktree)).toHaveLength(history);
    expect(scenario.sourceControl.pushes).toHaveLength(pushes);
    expect(await scenario.sourceControl.isClean(worktree)).toBe(true);
    expect(scenario.workspace.tree(worktree.path).has(`${BRANCH_DIRECTORY}/before-report.json`)).toBe(false);
  });

  it('scans the facts that will stand in the pull request body', async () => {
    const { scenario, recorder, behaviour } = await openPullRequest();
    scenario.secrets.secrets = [{ source: 'keychain item deploy-key', value: 'tok_live_123456789' }];
    recorder.facts = [{ label: 'Session', value: 'tok_live_123456789' }];

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind).toBe('failed');
    expect(await filmEvents(scenario)).not.toContain(PIPELINE_EVENTS.filmCommitted);
  });

  it('scans a text screenshot as it scans a report', async () => {
    const { scenario, recorder, behaviour } = await openPullRequest();
    scenario.secrets.secrets = [{ source: 'keychain item deploy-key', value: 'tok_live_123456789' }];
    recorder.screenshots = [FINAL_SCREENSHOT];
    recorder.screenshotContent = () => '<svg><text>tok_live_123456789</text></svg>';

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind === 'failed' ? outcome.reason : '').toContain('secret scan refused');
  });

  it('restores the worktree when a recorded file cannot be copied', async () => {
    const { scenario, recorder, behaviour } = await openPullRequest();
    const worktree = scenario.worktree();
    const history = scenario.sourceControl.history(worktree).length;
    recorder.screenshots = [FINAL_SCREENSHOT];
    recorder.behaviour = (request, call) => {
      if (call === 2) scenario.workspace.write(STORE_ROOT, `${request.outputDirectory.slice(STORE_ROOT.length + 1)}/${FINAL_SCREENSHOT}`, 'image');
    };
    const files = scenario.workspace;
    const copy = files.copyFile.bind(files);
    files.copyFile = (fromRoot, fromPath, toRoot, toPath) => (toPath.endsWith('after.svg') ? Promise.resolve(false) : copy(fromRoot, fromPath, toRoot, toPath));

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind).toBe('failed');
    expect(scenario.sourceControl.history(worktree)).toHaveLength(history);
    expect([...scenario.workspace.tree(worktree.path).keys()].some((path) => path.startsWith(BRANCH_DIRECTORY))).toBe(false);
  });

  it('fails the film, without committing, when the head moved while it was recorded', async () => {
    const { scenario, recorder, behaviour } = await openPullRequest();
    const worktree = scenario.worktree();
    recorder.behaviour = async (_request, call) => {
      if (call !== 2) return;
      scenario.workspace.write(worktree.path, 'app/pages/other.vue', 'changed\n');
      scenario.sourceControl.agentCommit(worktree, 'feat(app): change the page');
      await scenario.sourceControl.push(worktree);
    };

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind === 'failed' ? outcome.reason : '').toContain('the head moved from');
    expect(await filmEvents(scenario)).not.toContain(PIPELINE_EVENTS.filmCommitted);
  });

  it('fails the film when the head on the forge is not the local head', async () => {
    const { scenario, recorder, behaviour } = await openPullRequest();
    const worktree = scenario.worktree();
    recorder.behaviour = (_request, call) => {
      if (call !== 2) return;
      scenario.workspace.write(worktree.path, 'app/pages/other.vue', 'changed\n');
      scenario.sourceControl.agentCommit(worktree, 'feat(app): change the page');
    };

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind === 'failed' ? outcome.reason : '').toContain('on the forge and');
  });

  it('fails a film that is stopped, saying so', async () => {
    const { behaviour, recorder } = await openPullRequest();
    const controller = new AbortController();
    recorder.behaviour = () => {
      controller.abort();
      throw new Error('aborted');
    };

    const outcome = await behaviour.film(ORDER, controller.signal);

    expect(outcome).toMatchObject({ kind: 'failed', reason: 'the film was stopped before it finished' });
  });

  it('pushes a head that was committed but not published before it films', async () => {
    const { scenario, behaviour } = await openPullRequest();
    const worktree = scenario.worktree();
    scenario.workspace.write(worktree.path, 'app/pages/other.vue', 'changed\n');
    const sha = scenario.sourceControl.agentCommit(worktree, 'chore(evidence): add proof');
    await scenario.events.append(PIPELINE_EVENTS.evidenceCommitted, `issue/${ISSUE_NUMBER}`, { sha, bundle: (await loadJournal(scenario.events, ISSUE_NUMBER)).evidence?.bundle, changes: [] });

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind).toBe('finished');
    expect(scenario.sourceControl.pushes.map((push) => push.headSha)).toContain(sha);
  });
});

describe('FilmBehaviour and the limits of the evidence of a pull request', () => {
  const AFTER_VIDEO = `${BRANCH_DIRECTORY}/after.mp4`;
  const BEFORE_VIDEO = `${BRANCH_DIRECTORY}/before.mp4`;
  const bytes = (size: number): string => 'v'.repeat(size);

  async function filmWith(limits: EvidenceLimits) {
    const world = await openPullRequest();
    world.recorder.videoPath = MP4_VIDEO;
    return { ...world, behaviour: behaviourOf(world.scenario, world, REPLAY_FILE, limits) };
  }

  async function committedBytes(world: Awaited<ReturnType<typeof openPullRequest>>): Promise<number> {
    const bundle = (await loadJournal(world.scenario.events, ISSUE_NUMBER)).evidence?.bundle;
    const tree = world.scenario.workspace.tree(world.scenario.worktree().path);
    return (bundle?.files ?? []).reduce((total, file) => total + Buffer.byteLength(tree.get(file.bundlePath) ?? ''), 0);
  }

  it('leaves a video over the file limit off the branch, tells so in the body and the record, and still finishes the film', async () => {
    const { scenario, recorder, behaviour } = await filmWith({ maxFileBytes: 100, maxTotalBytes: 1_000_000 });
    recorder.videoContent = (ref) => (ref === scenario.worktree().baseSha ? bytes(40) : bytes(150));

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind).toBe('finished');
    const tree = scenario.workspace.tree(scenario.worktree().path);
    expect(tree.has(BEFORE_VIDEO)).toBe(true);
    expect(tree.has(AFTER_VIDEO)).toBe(false);
    expect(tree.has(`${BRANCH_DIRECTORY}/after-report.json`)).toBe(true);
    const film = (await loadJournal(scenario.events, ISSUE_NUMBER)).films[0];
    expect(film?.after.omitted).toEqual([{ path: AFTER_VIDEO, bytes: 150, reason: 'file-limit', limitBytes: 100 }]);
    expect(film?.before.omitted).toEqual([]);
    expect(film?.after.storeVideo).toBe(`films/${SCENARIO}/after/${MP4_VIDEO}`);
    const body = scenario.github.bodyUpdates.at(-1)?.body ?? '';
    expect(body).toContain('Left out of the pull request: `after.mp4`, 150 B, over the limit of 100 B per file (evidence.maxFileBytes).');
    expect(body).toContain('[Watch the recording]');
  });

  it('leaves out the heaviest files first while the films would take the pull request past the total limit', async () => {
    const { scenario, recorder, behaviour } = await filmWith({ maxFileBytes: 1_000, maxTotalBytes: 250 });
    recorder.screenshots = [FINAL_SCREENSHOT];
    recorder.videoContent = (ref) => (ref === scenario.worktree().baseSha ? bytes(120) : bytes(200));
    recorder.screenshotContent = () => bytes(30);

    await behaviour.film(ORDER, SIGNAL);

    const film = (await loadJournal(scenario.events, ISSUE_NUMBER)).films[0];
    expect(film?.after.omitted).toEqual([{ path: AFTER_VIDEO, bytes: 200, reason: 'total-limit', limitBytes: 250 }]);
    expect(film?.before.omitted).toEqual([]);
  });

  it('counts the evidence the pull request already holds: its bundle and the films of the other scenarios', async () => {
    const world = await filmWith({ maxFileBytes: 1_000, maxTotalBytes: 1_000_000 });
    const held = await committedBytes(world);
    expect(held).toBeGreaterThan(0);
    const limits = { maxFileBytes: 1_000, maxTotalBytes: held + 190 };
    const behaviour = behaviourOf(world.scenario, world, REPLAY_FILE, limits);
    world.recorder.videoContent = () => bytes(60);

    await behaviour.film(ORDER, SIGNAL);
    await behaviour.film({ ...ORDER, scenario: 'order-history' }, SIGNAL);

    const films = (await loadJournal(world.scenario.events, ISSUE_NUMBER)).films;
    expect(films[0]?.after.omitted).toEqual([]);
    expect(films[1]?.before.omitted).toEqual([]);
    expect(films[1]?.after.omitted).toEqual([
      { path: `.evidence/${ISSUE_NUMBER}/films/order-history/after.mp4`, bytes: 60, reason: 'total-limit', limitBytes: limits.maxTotalBytes },
    ]);
  });

  it('never leaves a report out, whatever the limits', async () => {
    const { scenario, behaviour } = await filmWith({ maxFileBytes: 1, maxTotalBytes: 1 });

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind).toBe('finished');
    const tree = scenario.workspace.tree(scenario.worktree().path);
    expect(tree.has(`${BRANCH_DIRECTORY}/before-report.json`)).toBe(true);
    expect(tree.has(BEFORE_VIDEO)).toBe(false);
    expect(tree.has(AFTER_VIDEO)).toBe(false);
  });

  it('removes from the branch what an earlier film of the scenario left where a file is now kept off', async () => {
    const world = await filmWith({ maxFileBytes: 100, maxTotalBytes: 1_000_000 });
    const { scenario, recorder, behaviour } = world;
    recorder.videoContent = () => bytes(50);
    await behaviour.film(ORDER, SIGNAL);
    const worktree = scenario.worktree();
    expect(scenario.workspace.tree(worktree.path).has(AFTER_VIDEO)).toBe(true);

    recorder.videoContent = (ref) => (ref === worktree.baseSha ? bytes(50) : bytes(150));
    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind).toBe('finished');
    expect(scenario.workspace.tree(worktree.path).has(AFTER_VIDEO)).toBe(false);
    expect(scenario.sourceControl.history(worktree).at(-1)?.snapshot.has(AFTER_VIDEO)).toBe(false);
  });

  it('keeps every file when they all fit', async () => {
    const { scenario, behaviour } = await filmWith({ maxFileBytes: 1_000_000, maxTotalBytes: 1_000_000 });
    await behaviour.film(ORDER, SIGNAL);
    const film = (await loadJournal(scenario.events, ISSUE_NUMBER)).films[0];
    expect([film?.before.omitted, film?.after.omitted]).toEqual([[], []]);
    expect(scenario.github.bodyUpdates.at(-1)?.body).not.toContain('Left out');
  });
});

describe('FilmBehaviour preparation', () => {
  it('defers while an agent run is open', async () => {
    const { activity, behaviour } = await openPullRequest();
    activity.open = true;
    await expect(behaviour.prepare(ORDER)).rejects.toMatchObject({ kind: 'agent-run' });
    await expect(behaviour.prepare(ORDER)).rejects.toBeInstanceOf(FilmDeferredError);
  });

  it('defers while memory pressure is not normal or free memory is short', async () => {
    const { scenario, behaviour } = await openPullRequest();
    scenario.resources.current = { freeMemoryPercent: 70, pressure: 'warn' };
    await expect(behaviour.prepare(ORDER)).rejects.toMatchObject({ kind: 'resources' });
    scenario.resources.current = { freeMemoryPercent: 10, pressure: 'normal' };
    await expect(behaviour.prepare(ORDER)).rejects.toMatchObject({ kind: 'resources' });
  });

  it('checks the resources again before each recording', async () => {
    const { scenario, recorder, behaviour } = await openPullRequest();
    recorder.behaviour = (_request, call) => {
      if (call === 1) scenario.resources.current = { freeMemoryPercent: 5, pressure: 'critical' };
    };

    const outcome = await behaviour.film(ORDER, SIGNAL);

    expect(outcome.kind === 'failed' ? outcome.reason : '').toContain('machine resources are short');
    expect(recorder.requests).toHaveLength(1);
  });

  it('refuses an invalid scenario name', async () => {
    const { behaviour } = await openPullRequest();
    await expect(behaviour.prepare({ ...ORDER, scenario: '../escape' })).rejects.toBeInstanceOf(FilmRefusedError);
  });

  it('refuses an issue whose pull request is not open', async () => {
    const { scenario, behaviour } = await openPullRequest();
    await scenario.events.append(PIPELINE_EVENTS.pullRequestMerged, `issue/${ISSUE_NUMBER}`, { mergeSha: 'merge0000' });
    await expect(behaviour.prepare(ORDER)).rejects.toThrow('already merged');
  });

  it('refuses a worktree with uncommitted changes', async () => {
    const { scenario, behaviour } = await openPullRequest();
    scenario.workspace.write(scenario.worktree().path, 'app/pages/mockup.vue', 'edited\n');
    await expect(behaviour.prepare(ORDER)).rejects.toThrow('uncommitted changes');
  });
});
