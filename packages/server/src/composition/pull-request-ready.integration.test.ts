import { mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MEDIA_LINKS_FILE, type NotifyFetchFunction } from '@agent-factory/adapters';
import { loadJournal, ProjectEventStore, type PipelineJournal } from '@agent-factory/application';
import { DEMO_UPLOAD_COMMAND_MAIN } from '../demo/demo-paths.ts';
import { filmSettings, installFilmTool } from '../testing/film-tool.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, FIRST_PROJECT, waitFor, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import { createDaemons } from './installation-daemon.ts';
import { openInstallation, type InstallationRuntime } from './installation/installation-runtime.ts';

const TIMEOUT_MS = 90_000;
const QUIET_PERIOD_MS = 700;
const SCENARIO = 'doc-tour';
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };
const READY_TITLE = /is ready to merge$/;
const FAILING_UPLOAD = ['node', '-e', 'console.error("the storage is full"); process.exit(3)', '{file}'];

interface ChatCard {
  readonly text: string;
  readonly cardsV2: readonly { readonly card: { readonly sections: readonly { readonly widgets: readonly { readonly textParagraph?: { readonly text: string } }[] }[] } }[];
}

/** The upload command of the demonstration, aimed at a directory of the test. */
function demoUpload(directory: string): readonly string[] {
  return [process.execPath, DEMO_UPLOAD_COMMAND_MAIN, '--to', directory, '--file', '{file}'];
}

describe('the notice that a pull request is ready, end to end', () => {
  let rehearsal: RehearsalEnvironment | null = null;
  let installation: InstallationRuntime | null = null;
  let tools = '';
  const cards: ChatCard[] = [];
  const warnings: string[] = [];

  const fetchOfCards: NotifyFetchFunction = (_url, init) => {
    cards.push(JSON.parse(init.body) as ChatCard);
    return Promise.resolve({ status: 200 });
  };

  /** A project that films, whose installation declares the upload command `media` builds from the directory the files go to. */
  async function open(media: ((uploads: string) => readonly string[]) | null): Promise<RehearsalEnvironment> {
    tools = await realpath(await mkdtemp(join(tmpdir(), 'factory-ready-tools-')));
    await installFilmTool(tools);
    rehearsal = await createRehearsal({
      projectSettings: { [FIRST_PROJECT]: filmSettings(tools) },
      checksSettleSeconds: 0,
      ...(media === null ? {} : { media: { upload: media(join(tools, 'uploads')) } }),
    });
    installation = await openInstallation(rehearsal.config, rehearsal.environment, {
      harnessFor: () => new RehearsalAgents(),
      resources: NORMAL_RESOURCES,
      usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
      fetch: fetchOfCards,
      log: { info: () => undefined, warn: (line) => warnings.push(line) },
      userHome: rehearsal.root,
    });
    return rehearsal;
  }

  /** Runs the factory until the pull request of the issue is announced, then a little longer to see whether it is announced again. */
  async function announced(runtime: InstallationRuntime, issue: number): Promise<PipelineJournal> {
    const running = new AbortController();
    const done = createDaemons(runtime).installation.run(running.signal);
    const events = new ProjectEventStore(runtime.events, FIRST_PROJECT);
    await waitFor(async () => ((await loadJournal(events, issue)).readyAnnouncements.length > 0 ? true : null), TIMEOUT_MS, `the ready notice of issue #${issue}`);
    await new Promise((resolve) => setTimeout(resolve, QUIET_PERIOD_MS));
    running.abort();
    await done;
    return loadJournal(events, issue);
  }

  beforeEach(() => {
    cards.length = 0;
    warnings.length = 0;
  });
  afterEach(async () => {
    installation?.close();
    await rehearsal?.cleanup();
    await rm(tools, { recursive: true, force: true });
    installation = null;
    rehearsal = null;
  });

  const readyCards = (): readonly ChatCard[] => cards.filter((card) => READY_TITLE.test(card.text));
  const linksOf = (card: ChatCard | undefined): string => card?.cardsV2[0]?.card.sections[0]?.widgets[1]?.textParagraph?.text ?? '';

  it(
    'tells once, when the film is recorded and the checks are in, with the links the upload command printed',
    async () => {
      const world = await open(demoUpload);
      const issue = await world.project(FIRST_PROJECT).addDocIssue('Document the release process', [SCENARIO]);

      const journal = await announced(installation as InstallationRuntime, issue);

      expect(journal.films.map((film) => film.scenario)).toEqual([SCENARIO]);
      const [announcement, ...later] = journal.readyAnnouncements;
      expect(later).toEqual([]);
      expect(announcement?.headSha).toBe(journal.pushedHead);
      expect(announcement?.failures).toEqual([]);
      expect(announcement?.links.map((link) => link.label)).toEqual([
        `${SCENARIO} · before · film.mp4`,
        `${SCENARIO} · before · final.svg`,
        `${SCENARIO} · after · film.mp4`,
        `${SCENARIO} · after · final.svg`,
      ]);
      const [beforeFilm, , afterFilm] = (announcement?.links ?? []).map((link) => link.url);
      expect(await readFile(fileURLToPath(beforeFilm ?? ''), 'utf8')).toBe(`ftypmp42 recording of ${SCENARIO} at ${journal.baseSha}`);
      expect(await readFile(fileURLToPath(afterFilm ?? ''), 'utf8')).toBe(`ftypmp42 recording of ${SCENARIO} at ${journal.films[0]?.headSha}`);
      expect(await readdir(join(tools, 'uploads'))).toHaveLength(4);
      expect(await readFile(join(world.config.directories.state, MEDIA_LINKS_FILE), 'utf8')).toContain('file://');

      expect(warnings).toEqual([]);
      expect(readyCards()).toHaveLength(1);
      expect(linksOf(readyCards()[0])).toContain(`<a href="${beforeFilm ?? ''}">${SCENARIO} · before · film.mp4</a>`);
    },
    TIMEOUT_MS * 2,
  );

  it(
    'tells without the links of the files the upload command could not upload, and says why in the log',
    async () => {
      const world = await open(() => FAILING_UPLOAD);
      const issue = await world.project(FIRST_PROJECT).addDocIssue('Document the support rota', [SCENARIO]);

      const journal = await announced(installation as InstallationRuntime, issue);

      const [announcement] = journal.readyAnnouncements;
      expect(announcement?.links).toEqual([]);
      expect(announcement?.failures.map((failure) => failure.label)).toEqual([
        `${SCENARIO} · before · film.mp4`,
        `${SCENARIO} · before · final.svg`,
        `${SCENARIO} · after · film.mp4`,
        `${SCENARIO} · after · final.svg`,
      ]);
      expect(announcement?.failures[0]?.reason).toBe('the upload command exited with 3: the storage is full');
      expect(warnings).toContain(`[${FIRST_PROJECT}] ${SCENARIO} · before · film.mp4 was not uploaded: the upload command exited with 3: the storage is full`);
      expect(readyCards()).toHaveLength(1);
      expect(linksOf(readyCards()[0])).toBe('');
    },
    TIMEOUT_MS * 2,
  );

  it(
    'tells with the cockpit and the forge only when the installation declares no upload command',
    async () => {
      const world = await open(null);
      const issue = await world.project(FIRST_PROJECT).addDocIssue('Document the on-call rota', [SCENARIO]);

      const journal = await announced(installation as InstallationRuntime, issue);

      expect(journal.readyAnnouncements).toMatchObject([{ links: [], failures: [] }]);
      expect(readyCards()).toHaveLength(1);
      expect(readyCards()[0]?.cardsV2[0]?.card.sections[0]?.widgets).toHaveLength(2);
    },
    TIMEOUT_MS * 2,
  );
});
