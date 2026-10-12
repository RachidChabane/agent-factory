import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SpawnCommandRunner, type NotifyFetchFunction } from '@agent-factory/adapters';
import { loadJournal, PIPELINE_EVENTS, ProjectEventStore, RUN_FINISHED_EVENT, RUN_STARTED_EVENT, type FactoryEventRecord, type PipelineJournal } from '@agent-factory/application';
import { dispatchCommand } from '../http/commands.ts';
import { SequenceCursor } from '../http/sequence-cursor.ts';
import { factoryLockPath } from './runtime.ts';
import { capturedOutput, cliContext, type CapturedOutput } from '../cli/testing/cli-harness.ts';
import { runCli } from '../cli/factory-cli.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { filmSettings, FILM_GATE_VARIABLE, FILM_LOG_FILE, installFilmTool, UNAVAILABLE_REASON, UNAVAILABLE_SCENARIO } from '../testing/film-tool.ts';
import { createRehearsal, FIRST_PROJECT, SECOND_PROJECT, waitFor, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import { openInstallation, type InstallationRuntime } from './installation/installation-runtime.ts';
import { createDaemons } from './installation-daemon.ts';
import { mergeOnOrder } from './project/project-use-cases.ts';

const TIMEOUT_MS = 90_000;
const HELD_FOR_MS = 700;
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };
const DELIVERED: NotifyFetchFunction = () => Promise.resolve({ status: 200 });
const WIDGETS_SCENARIO = 'doc-tour';
const GADGETS_SCENARIO = 'rota-tour';
const OPERATOR = 'alex';
const LIFETIME = new AbortController().signal;

interface FilmSpan {
  readonly project: string;
  readonly scenario: string;
  readonly queued: number;
  readonly started: number;
  readonly ended: number;
}

const PROJECT_SUBJECT = /^project\/([^/]+)\/issue\/\d+$/;

function filmSpans(records: readonly FactoryEventRecord[]): readonly FilmSpan[] {
  const spans: FilmSpan[] = [];
  const queued = new Map<string, number>();
  const started = new Map<string, number>();
  for (const record of records) {
    const project = PROJECT_SUBJECT.exec(record.subject)?.[1];
    const scenario = (record.payload as { scenario?: string } | null)?.scenario;
    if (project === undefined || scenario === undefined) continue;
    const key = `${record.subject}/${scenario}`;
    if (record.type === PIPELINE_EVENTS.filmQueued) queued.set(key, record.sequence);
    else if (record.type === PIPELINE_EVENTS.filmStarted) started.set(key, record.sequence);
    else if (record.type === PIPELINE_EVENTS.filmFinished || record.type === PIPELINE_EVENTS.filmFailed) {
      spans.push({ project, scenario, queued: queued.get(key) ?? 0, started: started.get(key) ?? 0, ended: record.sequence });
    }
  }
  return spans;
}

describe('films across an installation of two projects that film', () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;
  let tools: string;
  let gate: string;
  let widgetsIssue = 0;
  let gadgetsIssue = 0;
  let lateIssue = 0;
  let heldWhileRecording = false;
  let widgetsEvents: ProjectEventStore;
  let gadgetsEvents: ProjectEventStore;
  const warnings: string[] = [];

  const journalOf = (events: ProjectEventStore, issue: number): Promise<PipelineJournal> => loadJournal(events, issue);
  const filmed = (events: ProjectEventStore, issue: number) =>
    waitFor(async () => {
      const journal = await journalOf(events, issue);
      return journal.filmOrders.length > 0 && journal.filmOrders.every((order) => order.status === 'finished') ? journal : null;
    }, TIMEOUT_MS, `the films of issue #${issue}`);

  function cli(captured: CapturedOutput) {
    const environment = { ...process.env, AGENT_FACTORY_HOME: rehearsal.root, USER: OPERATOR };
    return cliContext(rehearsal.root, captured, () => Promise.resolve(rehearsal.config), {
      environment,
      runner: new SpawnCommandRunner(),
      openInstallation: (loaded, overrides = {}) =>
        openInstallation(loaded, environment, {
          userHome: rehearsal.root,
          resources: NORMAL_RESOURCES,
          usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
          fetch: DELIVERED,
          log: { info: () => undefined, warn: (line) => warnings.push(line) },
          ...overrides,
        }),
    });
  }

  beforeAll(async () => {
    tools = await realpath(await mkdtemp(join(tmpdir(), 'factory-film-tools-')));
    gate = join(tools, 'gate');
    await installFilmTool(tools);
    const settings = filmSettings(tools, { [FILM_GATE_VARIABLE]: gate });
    rehearsal = await createRehearsal({ projects: [FIRST_PROJECT, SECOND_PROJECT], projectSettings: { [FIRST_PROJECT]: settings, [SECOND_PROJECT]: settings } });
    installation = await openInstallation(rehearsal.config, rehearsal.environment, {
      harnessFor: () => new RehearsalAgents(),
      resources: NORMAL_RESOURCES,
      usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
      fetch: DELIVERED,
      log: { info: () => undefined, warn: (line) => warnings.push(line) },
      userHome: rehearsal.root,
    });
    widgetsEvents = new ProjectEventStore(installation.events, FIRST_PROJECT);
    gadgetsEvents = new ProjectEventStore(installation.events, SECOND_PROJECT);
    widgetsIssue = await rehearsal.project(FIRST_PROJECT).addDocIssue('Document the release process', [WIDGETS_SCENARIO]);
    gadgetsIssue = await rehearsal.project(SECOND_PROJECT).addDocIssue('Document the support rota', [GADGETS_SCENARIO]);
    const controller = new AbortController();
    const running = createDaemons(installation).installation.run(controller.signal);

    await waitFor(
      async () => {
        const journals = await Promise.all([journalOf(widgetsEvents, widgetsIssue), journalOf(gadgetsEvents, gadgetsIssue)]);
        return journals.some((journal) => journal.filmOrders.some((order) => order.status === 'running')) ? true : null;
      },
      TIMEOUT_MS,
      'a film to start recording',
    );
    lateIssue = await rehearsal.project(SECOND_PROJECT).addDocIssue('Document the on-call rota');
    await new Promise((resolve) => setTimeout(resolve, HELD_FOR_MS));
    heldWhileRecording = (await journalOf(gadgetsEvents, lateIssue)).state === null;
    await writeFile(gate, '');
    await filmed(widgetsEvents, widgetsIssue);
    await filmed(gadgetsEvents, gadgetsIssue);
    await waitFor(async () => ((await journalOf(gadgetsEvents, lateIssue)).state === 'pr-open' ? true : null), TIMEOUT_MS, 'the held issue to open its pull request');
    controller.abort();
    await running;
  }, TIMEOUT_MS * 3);

  afterAll(async () => {
    installation.close();
    await rehearsal.cleanup();
    await rm(tools, { recursive: true, force: true });
  });

  it('records the declared film of each project once, one at a time, and while no agent runs in any project', async () => {
    const records = await installation.events.read('', 0);
    const spans = filmSpans(records);
    expect(spans.map((span) => [span.project, span.scenario]).sort()).toEqual([[SECOND_PROJECT, GADGETS_SCENARIO], [FIRST_PROJECT, WIDGETS_SCENARIO]]);
    const ordered = spans.toSorted((left, right) => left.started - right.started);
    expect(ordered.map((span) => span.queued)).toEqual(ordered.map((span) => span.queued).toSorted((left, right) => left - right));
    const [first, second] = ordered;
    expect(first?.ended).toBeLessThan(second?.started ?? 0);
    for (const span of spans) {
      const between = records.filter((record) => record.sequence > span.started && record.sequence < span.ended);
      expect(between.filter((record) => record.type === RUN_STARTED_EVENT || record.type === RUN_FINISHED_EVENT).map((record) => [record.sequence, record.type, record.subject])).toEqual([]);
    }
    expect(warnings).toEqual([]);
  });

  it('starts no issue, in any project, while a film records', async () => {
    expect(heldWhileRecording).toBe(true);
    const late = await journalOf(gadgetsEvents, lateIssue);
    expect(late.state).toBe('pr-open');
  });

  it('runs the film command on the base and then on the head, giving the head the replay file of the base', async () => {
    const journal = await journalOf(widgetsEvents, widgetsIssue);
    const invocations = (await readFile(join(tools, FILM_LOG_FILE), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { scenario: string; ref: string; replay: string | null })
      .filter((invocation) => invocation.scenario === WIDGETS_SCENARIO);
    expect(invocations.map((invocation) => invocation.ref)).toEqual([journal.baseSha, journal.films[0]?.headSha]);
    expect(invocations[0]?.replay).toBeNull();
    expect(invocations[1]?.replay).toBe(join(rehearsal.config.projects[0]?.directories.evidence ?? '', `issue-${widgetsIssue}`, 'films', WIDGETS_SCENARIO, 'before', 'replay.json'));
  });

  it('commits the recordings on the branch of the pull request and records the head the merge goes on', async () => {
    const journal = await journalOf(widgetsEvents, widgetsIssue);
    const film = journal.films[0];
    expect(film).toBeDefined();
    const repository = installation.project(FIRST_PROJECT).repository;
    const before = await repository.file(film?.commitSha ?? '', film?.before.video ?? '');
    const after = await repository.file(film?.commitSha ?? '', film?.after.video ?? '');
    expect(new TextDecoder().decode(before ?? new Uint8Array())).toBe(`ftypmp42 recording of ${WIDGETS_SCENARIO} at ${journal.baseSha}`);
    expect(new TextDecoder().decode(after ?? new Uint8Array())).toBe(`ftypmp42 recording of ${WIDGETS_SCENARIO} at ${film?.headSha}`);
    expect(film?.before.screenshots).toEqual([`.evidence/${widgetsIssue}/films/${WIDGETS_SCENARIO}/before.svg`]);
    expect(await repository.file(film?.commitSha ?? '', film?.after.report ?? '')).not.toBeNull();
    expect(journal.pushedHead).toBe(film?.commitSha);
    expect(journal.lastCommitSha).toBe(film?.commitSha);
  });

  it('replaces the placeholder of the pull request body by the recordings, linked through the forge of the project', async () => {
    const journal = await journalOf(widgetsEvents, widgetsIssue);
    const details = await rehearsal.project(FIRST_PROJECT).forge.pullRequestDetails(journal.pullRequest?.number ?? 0);
    const commit = journal.films[0]?.commitSha ?? '';
    expect(details.body).toContain('## Behaviour on video');
    expect(details.body).toContain(`### Scenario \`${WIDGETS_SCENARIO}\``);
    expect(details.body).not.toContain('are being recorded');
    expect(details.body).toContain(`/api/projects/${FIRST_PROJECT}/blob/${commit}/.evidence/${widgetsIssue}/films/${WIDGETS_SCENARIO}/before.mp4`);
    expect(details.body).toContain('- Replayed: false');
    expect(details.body).toContain('- Replayed: true');
    expect(details.body).not.toContain('github.com');
  });

  it('lets the merge go on once the films of a pull request are in', async () => {
    const journal = await journalOf(gadgetsEvents, gadgetsIssue);
    const merged = await mergeOnOrder(installation.project(SECOND_PROJECT)).merge({ pullRequestNumber: journal.pullRequest?.number ?? 0, expectedHeadSha: journal.pushedHead ?? '' });
    expect(merged.issueNumber).toBe(gadgetsIssue);
  });

  it('films a scenario from the command line when no factory runs, and says what it left', async () => {
    const captured = capturedOutput();
    const code = await runCli(['--project', FIRST_PROJECT, 'film', String(widgetsIssue), '--scenario', 'extra-tour'], cli(captured));

    expect(captured.errors).toEqual([]);
    expect(code).toBe(0);
    expect(captured.lines[0]).toMatch(new RegExp(`^Films of scenario extra-tour recorded on pull request #\\d+ of ${FIRST_PROJECT}#${widgetsIssue} at [0-9a-f]{40}$`));
    expect(captured.lines[1]).toBe(`Before: .evidence/${widgetsIssue}/films/extra-tour/before.mp4`);
    expect((await journalOf(widgetsEvents, widgetsIssue)).films.map((film) => film.scenario)).toEqual([WIDGETS_SCENARIO, 'extra-tour']);
  });

  it('reports a film the tool skipped, with the reason', async () => {
    const captured = capturedOutput();
    const code = await runCli(['--project', FIRST_PROJECT, 'film', String(widgetsIssue), '--scenario', UNAVAILABLE_SCENARIO], cli(captured));

    expect(code).toBe(1);
    expect(captured.errors).toEqual([`The film of scenario ${UNAVAILABLE_SCENARIO} for ${FIRST_PROJECT}#${widgetsIssue} failed: the scenario was skipped: ${UNAVAILABLE_REASON}`]);
    const order = (await journalOf(widgetsEvents, widgetsIssue)).filmOrders.find((candidate) => candidate.scenario === UNAVAILABLE_SCENARIO);
    expect(order).toMatchObject({ status: 'failed', reason: `the scenario was skipped: ${UNAVAILABLE_REASON}` });
    const details = await rehearsal.project(FIRST_PROJECT).forge.pullRequestDetails((await journalOf(widgetsEvents, widgetsIssue)).pullRequest?.number ?? 0);
    expect(details.body).toContain(`The recording of this scenario failed: the scenario was skipped: ${UNAVAILABLE_REASON}.`);
    expect(details.body).toContain(`agent-factory film ${widgetsIssue} --scenario ${UNAVAILABLE_SCENARIO} --project ${FIRST_PROJECT}`);
  });

  it('refuses clearly an issue it cannot film, a project that films nothing and a scenario that is not a name', async () => {
    const unknown = capturedOutput();
    expect(await runCli(['--project', FIRST_PROJECT, 'film', '99', '--scenario', 'tour'], cli(unknown))).toBe(1);
    expect(unknown.errors).toEqual(['Issue #99 cannot be filmed: it is unknown to the factory, not awaiting a merge']);

    const merged = capturedOutput();
    expect(await runCli(['--project', SECOND_PROJECT, 'film', String(gadgetsIssue), '--scenario', 'tour'], cli(merged))).toBe(1);
    expect(merged.errors[0]).toContain('already merged');

    const badName = capturedOutput();
    expect(await runCli(['--project', FIRST_PROJECT, 'film', String(widgetsIssue), '--scenario', '../escape'], cli(badName))).toBe(2);
    expect(badName.errors[0]).toContain('--scenario must be letters, digits, dot, underscore and hyphen');
  });

  it('queues a scenario from the command line while a factory runs, and holds the merge for it', async () => {
    await writeFile(factoryLockPath(rehearsal.config.directories.state), `${process.ppid}\n`);
    try {
      const captured = capturedOutput();
      expect(await runCli(['--project', FIRST_PROJECT, 'film', String(widgetsIssue), '--scenario', 'queued-by-cli'], cli(captured))).toBe(0);
      expect(captured.lines).toEqual([`The film of scenario queued-by-cli is queued for ${FIRST_PROJECT}#${widgetsIssue}; the factory running as process ${process.ppid} records it in its turn`]);
      const journal = await journalOf(widgetsEvents, widgetsIssue);
      expect(journal.filmOrders.find((order) => order.scenario === 'queued-by-cli')).toMatchObject({ status: 'queued', operator: OPERATOR });

      const again = capturedOutput();
      expect(await runCli(['--project', FIRST_PROJECT, 'film', String(widgetsIssue), '--scenario', 'queued-by-cli'], cli(again))).toBe(1);
      expect(again.errors[0]).toContain('the film of scenario queued-by-cli is already queued');

      const merge = capturedOutput();
      expect(await runCli(['--project', FIRST_PROJECT, 'merge', String(journal.pullRequest?.number ?? 0), '--expected-head', journal.pushedHead ?? ''], cli(merge))).toBe(1);
      expect(merge.errors[0]).toContain('films in progress, expected around');
    } finally {
      await rm(factoryLockPath(rehearsal.config.directories.state), { force: true });
    }
  });

  it('takes an order from the cockpit only from a running factory, and queues it once', async () => {
    const cursor = new SequenceCursor(installation.events);
    const order = { project: FIRST_PROJECT, issueNumber: widgetsIssue, scenario: 'ordered-by-cockpit' };

    const stopped = await dispatchCommand('pr.film', order, { runtime: installation, daemons: null, operator: OPERATOR, lifetime: LIFETIME }, cursor);
    expect(stopped).toMatchObject({ status: 409, body: { error: 'the factory is not running; start it with "agent-factory start"' } });

    const daemons = createDaemons(installation);
    const accepted = await dispatchCommand('pr.film', order, { runtime: installation, daemons, operator: OPERATOR, lifetime: LIFETIME }, cursor);
    expect(accepted).toMatchObject({ status: 200, body: { effect: expect.stringContaining(`The film of scenario ordered-by-cockpit is queued for issue #${widgetsIssue} of ${FIRST_PROJECT}`) } });
    expect((await journalOf(widgetsEvents, widgetsIssue)).filmOrders.find((candidate) => candidate.scenario === 'ordered-by-cockpit')).toMatchObject({ status: 'queued', operator: OPERATOR });

    const again = await dispatchCommand('pr.film', order, { runtime: installation, daemons, operator: OPERATOR, lifetime: LIFETIME }, cursor);
    expect(again).toMatchObject({ status: 409, body: { error: expect.stringContaining('already queued') } });
    const merged = await dispatchCommand('pr.film', { ...order, project: SECOND_PROJECT, issueNumber: gadgetsIssue }, { runtime: installation, daemons, operator: OPERATOR, lifetime: LIFETIME }, cursor);
    expect(merged).toMatchObject({ status: 409, body: { error: expect.stringContaining('already merged') } });
  });
});
