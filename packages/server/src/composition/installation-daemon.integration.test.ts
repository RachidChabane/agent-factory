import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AUDIT_CONCLUDED_EVENT,
  DAEMON_STOPPED_EVENT,
  loadAudit,
  loadJournal,
  ProjectEventStore,
  RUN_FINISHED_EVENT,
  RUN_STARTED_EVENT,
  RunStartedPayloadSchema,
} from '@agent-factory/application';
import type { NotifyFetchFunction } from '@agent-factory/adapters';
import { createRehearsal, FIRST_PROJECT, SECOND_PROJECT, TEST_WEBHOOK_URL, waitFor, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { openInstallation, type InstallationRuntime } from './installation/installation-runtime.ts';
import { createDaemons } from './installation-daemon.ts';

const TIMEOUT_MS = 60_000;
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };

describe('an installation of two projects on local forges', () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;
  const notifications: { url: string; text: string }[] = [];
  const warnings: string[] = [];
  const fakeFetch: NotifyFetchFunction = (url, init) => {
    const message: unknown = JSON.parse(init.body);
    const text = typeof message === 'object' && message !== null && 'text' in message && typeof message.text === 'string' ? message.text : '';
    notifications.push({ url, text });
    return Promise.resolve({ status: 200 });
  };

  beforeEach(async () => {
    notifications.length = 0;
    warnings.length = 0;
    rehearsal = await createRehearsal({ projects: [FIRST_PROJECT, SECOND_PROJECT] });
    const agents = new RehearsalAgents();
    installation = await openInstallation(rehearsal.config, rehearsal.environment, {
      harnessFor: () => agents,
      resources: NORMAL_RESOURCES,
      fetch: fakeFetch,
      usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
      log: { info: () => undefined, warn: (line) => warnings.push(line) },
      userHome: rehearsal.root,
    });
  });

  afterEach(async () => {
    installation.close();
    await rehearsal.cleanup();
  });

  it(
    'takes each project to an open pull request under the same issue number, records an outside merge, audits a direct push and stops cleanly',
    async () => {
      const widgets = rehearsal.project(FIRST_PROJECT);
      const gadgets = rehearsal.project(SECOND_PROJECT);
      const widgetsIssue = await widgets.addDocIssue('Document the release process');
      const gadgetsIssue = await gadgets.addDocIssue('Document the support rota');
      expect(widgetsIssue).toBe(gadgetsIssue);
      const widgetsEvents = new ProjectEventStore(installation.events, FIRST_PROJECT);
      const gadgetsEvents = new ProjectEventStore(installation.events, SECOND_PROJECT);
      const controller = new AbortController();
      const daemons = createDaemons(installation);
      const running = daemons.installation.run(controller.signal);

      const opened = async (events: ProjectEventStore, issue: number) =>
        waitFor(async () => {
          const journal = await loadJournal(events, issue);
          return journal.state === 'pr-open' ? journal : null;
        }, TIMEOUT_MS, `issue #${issue} to open its pull request`);
      const widgetsJournal = await opened(widgetsEvents, widgetsIssue);
      const gadgetsJournal = await opened(gadgetsEvents, gadgetsIssue);
      expect(widgetsJournal.spec?.title).toBe('Document the release process');
      expect(gadgetsJournal.spec?.title).toBe('Document the support rota');

      const pullRequest = widgetsJournal.pullRequest;
      expect(pullRequest).not.toBeNull();
      await widgets.forge.squashMerge(pullRequest?.number ?? 0, widgetsJournal.pushedHead ?? '');
      const hotfix = widgets.pushDirectCommit('NOTES.md', 'Release notes live here.\n', 'docs: add release notes without review');

      await waitFor(async () => ((await loadJournal(widgetsEvents, widgetsIssue)).state === 'merged' ? true : null), TIMEOUT_MS, 'the merge to be recorded');
      const audit = await waitFor(async () => {
        const record = await loadAudit(widgetsEvents, hotfix);
        return record?.state === 'challenge' ? record : null;
      }, TIMEOUT_MS, `the audit of ${hotfix}`);
      expect(audit).toMatchObject({ reason: 'direct-push', draft: expect.objectContaining({ title: expect.any(String) }) });
      expect(await loadAudit(gadgetsEvents, hotfix)).toBeNull();
      expect((await loadJournal(gadgetsEvents, gadgetsIssue)).state).toBe('pr-open');

      controller.abort();
      await running;

      const after = await installation.events.read('', 0);
      expect(after.at(-1)?.type).toBe(DAEMON_STOPPED_EVENT);
      expect(daemons.project(FIRST_PROJECT)?.runningIssues()).toEqual([]);
      const started = after.filter((record) => record.type === RUN_STARTED_EVENT).map((record) => RunStartedPayloadSchema.parse(record.payload));
      expect(new Set(started.map((run) => run.project))).toEqual(new Set([FIRST_PROJECT, SECOND_PROJECT]));
      expect(after.filter((record) => record.type === RUN_FINISHED_EVENT)).toHaveLength(started.length);
      expect(after.filter((record) => record.type === AUDIT_CONCLUDED_EVENT)).toHaveLength(1);
      expect(warnings).toEqual([]);
      expect(notifications.every((notification) => notification.url === TEST_WEBHOOK_URL)).toBe(true);
      expect(notifications.some((notification) => notification.text.includes(`Audit of ${hotfix.slice(0, 7)} concluded: challenge`))).toBe(true);
      expect(notifications.filter((notification) => notification.text.includes('opened for issue'))).toHaveLength(2);
    },
    TIMEOUT_MS * 2,
  );
});
