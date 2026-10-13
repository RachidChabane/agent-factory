import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NotifyFetchFunction } from '@agent-factory/adapters';
import {
  FILM_TOOL_RECHECK_INTERVAL_MS,
  FILM_TOOLS_SUBJECT,
  filmToolWaitOf,
  latestToolChecks,
  loadJournal,
  PIPELINE_EVENTS,
  ProjectEventStore,
  type FilmToolWait,
  type PipelineJournal,
} from '@agent-factory/application';
import { filmSettings, installFilmTool } from '../testing/film-tool.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, FIRST_PROJECT, waitFor, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import { createDaemons } from './installation-daemon.ts';
import { openInstallation, type InstallationRuntime } from './installation/installation-runtime.ts';

const TIMEOUT_MS = 90_000;
const QUIET_PERIOD_MS = 500;
const SCENARIO = 'doc-tour';
const VAULT_LOGIN = 'vault login -method=oidc';
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };
const SECOND_MS = 1_000;

interface ChatCard {
  readonly text: string;
}

describe('films that wait for the tools they need, over the composition of an installation', () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;
  let directory: string;
  let events: ProjectEventStore;
  let issue = 0;
  let clockOffsetMs = 0;
  const cards: ChatCard[] = [];
  const warnings: string[] = [];
  const controller = new AbortController();
  let running: Promise<void> = Promise.resolve();

  const fetchOfCards: NotifyFetchFunction = (_url, init) => {
    cards.push(JSON.parse(init.body) as ChatCard);
    return Promise.resolve({ status: 200 });
  };
  const flag = (name: string): string => join(directory, name);
  const journal = (): Promise<PipelineJournal> => loadJournal(events, issue);
  const waitOfFilms = async (): Promise<FilmToolWait | null> => filmToolWaitOf(await events.read(FILM_TOOLS_SUBJECT, 0));
  const titles = (): readonly string[] => cards.map((card) => card.text.split('\n')[0] ?? '').filter((title) => title.startsWith('Films of widgets'));
  const advanceClock = (milliseconds: number): void => {
    clockOffsetMs += milliseconds;
  };
  const waitUntilWaitingFor = (tool: string) =>
    waitFor(async () => ((await waitOfFilms())?.tool === tool ? true : null), TIMEOUT_MS, `the films to wait for ${tool}`);

  beforeAll(async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), 'factory-film-tools-')));
    await installFilmTool(directory);
    const vault = { name: 'vault', check: ['test', '-f', flag('vault-session')], login: VAULT_LOGIN, timeoutSeconds: 10 };
    const registry = { name: 'registry', check: ['test', '-f', flag('registry-session')], timeoutSeconds: 10 };
    const settings = { ...filmSettings(directory, {}, { tools: ['vault', 'registry'] }), tools: [registry] };
    rehearsal = await createRehearsal({ tools: [vault], projectSettings: { [FIRST_PROJECT]: settings }, checksSettleSeconds: 0 });
    installation = await openInstallation(rehearsal.config, rehearsal.environment, {
      harnessFor: () => new RehearsalAgents(),
      resources: NORMAL_RESOURCES,
      usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
      fetch: fetchOfCards,
      clock: { now: () => new Date(Date.now() + clockOffsetMs) },
      log: { info: () => undefined, warn: (line) => warnings.push(line) },
      userHome: rehearsal.root,
    });
    events = new ProjectEventStore(installation.events, FIRST_PROJECT);
    issue = await rehearsal.project(FIRST_PROJECT).addDocIssue('Document the release process', [SCENARIO]);
    running = createDaemons(installation).installation.run(controller.signal);
  }, TIMEOUT_MS);

  afterAll(async () => {
    controller.abort();
    await running;
    installation.close();
    await rehearsal.cleanup();
    await rm(directory, { recursive: true, force: true });
  });

  it('keeps the film queued, without failing it, while the first tool fails, and tells the operator once what to run', async () => {
    await waitUntilWaitingFor('vault');
    await new Promise((resolve) => setTimeout(resolve, QUIET_PERIOD_MS));

    const wait = await waitOfFilms();
    expect(wait).toMatchObject({ tool: 'vault', scope: 'installation', status: 'unauthenticated', loginCommand: VAULT_LOGIN });
    const state = await journal();
    expect(state.state).toBe('pr-open');
    expect(state.filmOrders.map((order) => order.status)).toEqual(['queued']);
    expect(await events.read('', 0).then((records) => records.some((record) => record.type === PIPELINE_EVENTS.filmStarted))).toBe(false);
    expect(titles()).toEqual(['Films of widgets wait for vault']);
    expect(JSON.stringify(cards.find((card) => card.text.startsWith('Films of widgets wait')))).toContain(`Log in with: ${VAULT_LOGIN}.`);
  });

  it('records the reading of each tool where the cockpit lists the tools of its scope', async () => {
    const installationChecks = latestToolChecks(await installation.events.read('settings', 0));
    expect(installationChecks.get('vault')).toMatchObject({ status: 'unauthenticated' });
  });

  it('moves on to the next tool that fails once the first passes, and does not tell the operator again', async () => {
    await writeFile(flag('vault-session'), '');
    advanceClock(FILM_TOOL_RECHECK_INTERVAL_MS + SECOND_MS);
    await waitUntilWaitingFor('registry');

    const wait = await waitOfFilms();
    expect(wait).toMatchObject({ tool: 'registry', scope: 'project', loginCommand: null });
    expect((await journal()).filmOrders.map((order) => order.status)).toEqual(['queued']);
    expect(titles()).toEqual(['Films of widgets wait for vault']);
    const projectChecks = latestToolChecks(await events.read('settings', 0));
    expect(projectChecks.get('registry')).toMatchObject({ status: 'unauthenticated' });
    expect(latestToolChecks(await installation.events.read('settings', 0)).get('vault')).toMatchObject({ status: 'connected' });
  });

  it('records the film once every tool passes, and says that the films resume', async () => {
    await writeFile(flag('registry-session'), '');
    advanceClock(FILM_TOOL_RECHECK_INTERVAL_MS + SECOND_MS);
    await waitFor(async () => ((await journal()).films.length > 0 ? true : null), TIMEOUT_MS, 'the film to be recorded');

    expect(await waitOfFilms()).toBeNull();
    const state = await journal();
    expect(state.filmOrders.map((order) => [order.scenario, order.status])).toEqual([[SCENARIO, 'finished']]);
    expect(titles()).toEqual(['Films of widgets wait for vault', 'Films of widgets resume']);
    expect(warnings).toEqual([]);
  });
});
