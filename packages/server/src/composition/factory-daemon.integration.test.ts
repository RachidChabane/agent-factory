import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AUDIT_CONCLUDED_EVENT,
  DAEMON_STOPPED_EVENT,
  loadAudit,
  loadJournal,
  RUN_FINISHED_EVENT,
  RUN_STARTED_EVENT,
} from '@agent-factory/application';
import type { NotifyFetchFunction } from '@agent-factory/adapters';
import { createRehearsal, TEST_WEBHOOK_URL, waitFor, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { openFactory, type FactoryContainer } from './factory-container.ts';
import { createDaemon } from './use-cases.ts';

const TIMEOUT_MS = 60_000;
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };

describe('factory daemon in local GitHub mode', () => {
  let rehearsal: RehearsalEnvironment;
  let factory: FactoryContainer;
  const notifications: { url: string; title: string }[] = [];
  const warnings: string[] = [];
  const fakeFetch: NotifyFetchFunction = (url, init) => {
    const message: unknown = JSON.parse(init.body);
    const title = typeof message === 'object' && message !== null && 'text' in message && typeof message.text === 'string' ? message.text : '';
    notifications.push({ url, title });
    return Promise.resolve({ status: 200 });
  };

  beforeEach(async () => {
    rehearsal = await createRehearsal();
    factory = await openFactory(rehearsal.config, rehearsal.environment, {
      harness: new RehearsalAgents(),
      resources: NORMAL_RESOURCES,
      fetch: fakeFetch,
      log: { info: () => undefined, warn: (line) => warnings.push(line) },
    });
  });

  afterEach(async () => {
    factory.close();
    await rehearsal.cleanup();
  });

  it(
    'runs two issues one after the other, records an outside merge, audits a direct push and stops cleanly',
    async () => {
      const first = await rehearsal.addDocIssue('Document the release process');
      const second = await rehearsal.addDocIssue('Document the audit process');
      const { events } = factory.dependencies;
      const controller = new AbortController();
      const daemon = createDaemon(factory);
      const running = daemon.run(controller.signal);

      const firstJournal = await waitFor(async () => {
        const journal = await loadJournal(events, first);
        return journal.state === 'pr-open' ? journal : null;
      }, TIMEOUT_MS, `issue #${first} to open its pull request`);
      const secondJournal = await waitFor(async () => {
        const journal = await loadJournal(events, second);
        return journal.state === 'pr-open' ? journal : null;
      }, TIMEOUT_MS, `issue #${second} to open its pull request`);
      const records = await events.read('', 0);
      const firstOpened = records.findIndex((record) => record.subject === `issue/${first}` && record.type === 'issue.transitioned' && JSON.stringify(record.payload).includes('"to":"pr-open"'));
      const secondTaken = records.findIndex((record) => record.subject === `issue/${second}`);
      expect(secondTaken).toBeGreaterThan(firstOpened);

      const firstPullRequest = firstJournal.pullRequest;
      expect(firstPullRequest).not.toBeNull();
      expect(secondJournal.pullRequest?.number).not.toBe(firstPullRequest?.number);
      await rehearsal.github.squashMerge(firstPullRequest?.number ?? 0, firstJournal.pushedHead ?? '');
      const hotfix = rehearsal.pushDirectCommit('NOTES.md', 'Release notes live here.\n', 'docs: add release notes without review');

      await waitFor(async () => ((await loadJournal(events, first)).state === 'merged' ? true : null), TIMEOUT_MS, `issue #${first} to be merged`);
      const audit = await waitFor(async () => {
        const record = await loadAudit(events, hotfix);
        return record?.state === 'challenge' ? record : null;
      }, TIMEOUT_MS, `the audit of ${hotfix}`);
      expect(audit).toMatchObject({ reason: 'direct-push', draft: expect.objectContaining({ title: expect.any(String) }) });

      controller.abort();
      await running;

      const after = await events.read('', 0);
      expect(after.at(-1)?.type).toBe(DAEMON_STOPPED_EVENT);
      expect(daemon.runningIssues()).toEqual([]);
      const mergedJournal = await loadJournal(events, first);
      expect(mergedJournal).toMatchObject({ state: 'merged', worktree: null });
      const started = after.filter((record) => record.type === RUN_STARTED_EVENT).length;
      const finished = after.filter((record) => record.type === RUN_FINISHED_EVENT).length;
      expect(started).toBe(7);
      expect(finished).toBe(started);
      expect(after.filter((record) => record.type === AUDIT_CONCLUDED_EVENT)).toHaveLength(1);
      expect(warnings).toEqual([]);
      expect(notifications.every((notification) => notification.url === TEST_WEBHOOK_URL)).toBe(true);
      expect(notifications.map((notification) => notification.title)).toEqual(
        expect.arrayContaining([
          `Pull request #${firstPullRequest?.number ?? 0} opened for issue #${first}`,
          `Pull request #${secondJournal.pullRequest?.number ?? 0} opened for issue #${second}`,
          `Audit of ${hotfix.slice(0, 7)} concluded: challenge`,
        ]),
      );
    },
    TIMEOUT_MS * 2,
  );
});
