import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NotifyFetchFunction } from '@agent-factory/adapters';
import { loadJournal, ProjectEventStore, type PipelineJournal } from '@agent-factory/application';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { filmSettings, installFilmTool } from '../testing/film-tool.ts';
import { createRehearsal, FIRST_PROJECT, waitFor, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import { openInstallation, type InstallationRuntime } from './installation/installation-runtime.ts';
import { createDaemons } from './installation-daemon.ts';

const TIMEOUT_MS = 90_000;
const SCENARIO = 'doc-tour';
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };
const DELIVERED: NotifyFetchFunction = () => Promise.resolve({ status: 200 });
/** The stand-in film tool writes a video of about seventy bytes and a screenshot of about a hundred. */
const FILE_LIMIT_BYTES = 80;
const TEXT = new TextDecoder();

describe('the limits of the evidence of a pull request, over a real repository and real files', () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;
  let tools: string;
  let issue = 0;
  let events: ProjectEventStore;

  const journalOf = (): Promise<PipelineJournal> => loadJournal(events, issue);

  beforeAll(async () => {
    tools = await realpath(await mkdtemp(join(tmpdir(), 'factory-film-limits-')));
    await installFilmTool(tools);
    rehearsal = await createRehearsal({ projectSettings: { [FIRST_PROJECT]: filmSettings(tools, {}, { maxFileBytes: FILE_LIMIT_BYTES }) } });
    installation = await openInstallation(rehearsal.config, rehearsal.environment, {
      harnessFor: () => new RehearsalAgents(),
      resources: NORMAL_RESOURCES,
      usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
      fetch: DELIVERED,
      log: { info: () => undefined, warn: () => undefined },
      userHome: rehearsal.root,
    });
    events = new ProjectEventStore(installation.events, FIRST_PROJECT);
    issue = await rehearsal.project(FIRST_PROJECT).addDocIssue('Document the release process', [SCENARIO]);
    const controller = new AbortController();
    const running = createDaemons(installation).installation.run(controller.signal);
    await waitFor(
      async () => {
        const journal = await journalOf();
        return journal.filmOrders.length > 0 && journal.filmOrders.every((order) => order.status === 'finished') ? journal : null;
      },
      TIMEOUT_MS,
      'the film of the issue',
    );
    controller.abort();
    await running;
  }, TIMEOUT_MS * 2);

  afterAll(async () => {
    installation.close();
    await rehearsal.cleanup();
    await rm(tools, { recursive: true, force: true });
  });

  it('commits the video and the reports of the film that fit, and not the screenshots over the file limit', async () => {
    const film = (await journalOf()).films[0];
    const repository = installation.project(FIRST_PROJECT).repository;
    const commit = film?.commitSha ?? '';
    expect(TEXT.decode((await repository.file(commit, film?.before.video ?? '')) ?? new Uint8Array())).toContain(`recording of ${SCENARIO}`);
    expect(await repository.file(commit, film?.before.report ?? '')).not.toBeNull();
    for (const phase of [film?.before, film?.after]) {
      const screenshot = phase?.screenshots[0] ?? '';
      expect(screenshot).not.toBe('');
      expect(await repository.file(commit, screenshot)).toBeNull();
      expect(phase?.omitted.map((file) => [file.path, file.reason, file.limitBytes])).toEqual([[screenshot, 'file-limit', FILE_LIMIT_BYTES]]);
      expect(phase?.omitted[0]?.bytes).toBeGreaterThan(FILE_LIMIT_BYTES);
    }
  });

  it('names each file left out, with its size and the limit, in the body of the pull request', async () => {
    const journal = await journalOf();
    const film = journal.films[0];
    const details = await rehearsal.project(FIRST_PROJECT).forge.pullRequestDetails(journal.pullRequest?.number ?? 0);
    const size = `${film?.before.omitted[0]?.bytes ?? 0} B`;
    expect(details.body).toContain(`Left out of the pull request: \`before.svg\`, ${size}, over the limit of ${FILE_LIMIT_BYTES} B per file (evidence.maxFileBytes).`);
    expect(details.body).toContain('Left out of the pull request: `after.svg`');
    expect(details.body).toContain('[Watch the recording]');
    expect(details.body).not.toContain('before.svg?raw=true');
  });

  it('still keeps the left-out files in the factory\'s own store, where the cockpit plays them from', async () => {
    const film = (await journalOf()).films[0];
    expect(film?.before.storeScreenshots).toHaveLength(1);
    const stored = join(rehearsal.config.projects[0]?.directories.evidence ?? '', `issue-${issue}`, film?.before.storeScreenshots[0] ?? '');
    expect(TEXT.decode(await readFile(stored))).toContain('<svg');
  });
});
