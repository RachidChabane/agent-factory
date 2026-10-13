import { describe, expect, it } from 'vitest';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import { OperatorNotifications } from '../notifications/operator-notifications.ts';
import type { FactoryEventRecord, Notifier } from '../ports.ts';
import { SteppingClock } from '../runs/test-support.ts';
import { SETTINGS_SUBJECT, TOOL_CHECKED_EVENT } from '../settings/settings-events.ts';
import { latestToolChecks } from '../settings/tool-checks.ts';
import {
  currentFilmToolWait,
  FILM_TOOLS_AVAILABLE_EVENT,
  FILM_TOOLS_SUBJECT,
  FILM_TOOLS_UNAVAILABLE_EVENT,
  filmToolWaitFor,
  filmToolWaitOf,
  FilmToolWaitReporter,
  LoggedFilmToolWait,
  type FilmToolFinding,
} from './film-tool-wait.ts';
import type { FilmTool } from './film-tools.ts';

const START = new Date('2026-10-12T08:00:00.000Z');
const MINUTE_MS = 60_000;
const VAULT: FilmTool = { name: 'vault', scope: 'installation', loginCommand: 'vault login -method=oidc' };
const REGISTRY: FilmTool = { name: 'registry', scope: 'project', loginCommand: null };

const finding = (tool: FilmTool, overrides: Partial<FilmToolFinding> = {}): FilmToolFinding => ({ tool, status: 'unauthenticated', detail: 'token expired', fixCommand: null, ...overrides });

function world() {
  const clock = new SteppingClock(START);
  const events = new InMemoryEventStore(clock);
  const notices: { title: string; body: string }[] = [];
  const notifier: Notifier = {
    notify: (title, body) => {
      notices.push({ title, body });
      return Promise.resolve();
    },
  };
  const notifications = new OperatorNotifications(notifier, 'https://factory.example.test/projects/storefront', { info: () => undefined, warn: () => undefined });
  const reporter = new FilmToolWaitReporter({ projectId: 'storefront', events, notifications });
  const advance = (minutes: number): void => clock.set(new Date(clock.now().getTime() + minutes * MINUTE_MS));
  return { events, notices, reporter, advance };
}

describe('the record of the films waiting for a tool', () => {
  it('begins with the first reading that fails, and tells the operator what to run', async () => {
    const { events, notices, reporter } = world();
    expect(await reporter.current()).toBeNull();

    await reporter.unavailable(finding(VAULT));

    expect(await reporter.current()).toEqual({
      tool: 'vault',
      scope: 'installation',
      status: 'unauthenticated',
      detail: 'token expired',
      loginCommand: 'vault login -method=oidc',
      fixCommand: null,
      since: START,
      checkedAt: START,
    });
    expect(events.typesOf(FILM_TOOLS_SUBJECT)).toEqual([FILM_TOOLS_UNAVAILABLE_EVENT]);
    expect(notices).toEqual([
      {
        title: 'Films of storefront wait for vault',
        body: 'The tool vault is not logged in: token expired. The queued films stay queued and none fails. Log in with: vault login -method=oidc. The factory checks again every 5 minutes and starts the films once every tool passes.',
      },
    ]);
  });

  it('keeps when the films began to wait when what the check finds changes, and tells the operator once', async () => {
    const { advance, notices, reporter } = world();
    await reporter.unavailable(finding(VAULT));
    advance(5);
    await reporter.unavailable(finding(REGISTRY, { status: 'missing', detail: 'registry is not installed', fixCommand: 'brew install registry' }));

    expect(await reporter.current()).toMatchObject({ tool: 'registry', scope: 'project', status: 'missing', loginCommand: null, fixCommand: 'brew install registry', since: START, checkedAt: new Date(START.getTime() + 5 * MINUTE_MS) });
    expect(notices).toHaveLength(1);
  });

  it('ends with the films starting again, which the operator is told once', async () => {
    const { events, notices, reporter } = world();
    await reporter.unavailable(finding(VAULT));

    await reporter.available(true);
    await reporter.available(true);

    expect(await reporter.current()).toBeNull();
    expect(events.typesOf(FILM_TOOLS_SUBJECT)).toEqual([FILM_TOOLS_UNAVAILABLE_EVENT, FILM_TOOLS_AVAILABLE_EVENT]);
    expect(notices.map((notice) => notice.title)).toEqual(['Films of storefront wait for vault', 'Films of storefront resume']);
  });

  it('ends without a notice when no film was queued to start again', async () => {
    const { notices, reporter } = world();
    await reporter.unavailable(finding(VAULT));
    await reporter.available(false);
    expect(notices.map((notice) => notice.title)).toEqual(['Films of storefront wait for vault']);
  });

  it('records and tells nothing when there was no wait to end', async () => {
    const { events, notices, reporter } = world();
    await reporter.available(true);
    expect(events.records).toEqual([]);
    expect(notices).toEqual([]);
  });

  it('begins a new wait, and tells the operator again, after one ended', async () => {
    const { advance, notices, reporter } = world();
    await reporter.unavailable(finding(VAULT));
    await reporter.available(true);
    advance(60);
    await reporter.unavailable(finding(VAULT));
    expect((await reporter.current())?.since).toEqual(new Date(START.getTime() + 60 * MINUTE_MS));
    expect(notices.filter((notice) => notice.title.includes('wait for'))).toHaveLength(2);
  });

  it('tells a fix command when the tool declares no login, and says when it declares neither', async () => {
    const { notices, reporter } = world();
    await reporter.unavailable(finding(REGISTRY, { status: 'error', detail: '', fixCommand: 'registry doctor' }));
    expect(notices[0]?.body).toContain('The tool registry did not answer its check.');
    expect(notices[0]?.body).toContain('The tool declares no login the factory can start. Restore it with: registry doctor.');
    const other = world();
    await other.reporter.unavailable(finding(REGISTRY, { status: 'missing' }));
    expect(other.notices[0]?.body).toContain('The tool declares no login or fix command: restore it by hand.');
  });
});

function record(sequence: number, type: string, payload: unknown, occurredAt: Date, subject: string): FactoryEventRecord {
  return { sequence, type, subject, payload, occurredAt };
}

const UNAVAILABLE = { tool: 'vault', scope: 'installation', status: 'unauthenticated', detail: 'token expired', loginCommand: null, fixCommand: null };
const LISTED = ['vault'];
const checked = (tool: string, occurredAt: Date, subject = SETTINGS_SUBJECT): FactoryEventRecord =>
  record(9, TOOL_CHECKED_EVENT, { tool, status: 'unauthenticated', version: null, detail: '', fixCommand: null, operator: 'alex' }, occurredAt, subject);

describe('the wait in force, read from a log', () => {
  const LATER = new Date(START.getTime() + 5 * MINUTE_MS);

  it('ignores events of other subjects and events it cannot read', () => {
    expect(filmToolWaitOf([record(1, FILM_TOOLS_UNAVAILABLE_EVENT, UNAVAILABLE, START, 'issue/4'), record(2, FILM_TOOLS_UNAVAILABLE_EVENT, { tool: 'vault' }, START, FILM_TOOLS_SUBJECT)])).toBeNull();
  });

  describe('for the tools the films of the project list', () => {
    const wait = [record(1, FILM_TOOLS_UNAVAILABLE_EVENT, UNAVAILABLE, START, FILM_TOOLS_SUBJECT)];

    it('is the wait for one of them', () => {
      expect(filmToolWaitFor(wait, ['registry', 'vault'])?.tool).toBe('vault');
    });

    it('is nothing for a wait for a tool they do not list, or when they list none', () => {
      expect(filmToolWaitFor(wait, ['registry'])).toBeNull();
      expect(filmToolWaitFor(wait, [])).toBeNull();
    });

    it('is read from the log of the project by the merge', async () => {
      const { events } = world();
      await events.append(FILM_TOOLS_UNAVAILABLE_EVENT, FILM_TOOLS_SUBJECT, UNAVAILABLE);
      expect((await new LoggedFilmToolWait(events, LISTED).current())?.tool).toBe('vault');
      expect(await new LoggedFilmToolWait(events, ['registry']).current()).toBeNull();
      await events.append(FILM_TOOLS_AVAILABLE_EVENT, FILM_TOOLS_SUBJECT, {});
      expect(await new LoggedFilmToolWait(events, LISTED).current()).toBeNull();
    });
  });

  describe('with when the tool was last read', () => {
    const wait = [record(1, FILM_TOOLS_UNAVAILABLE_EVENT, UNAVAILABLE, START, FILM_TOOLS_SUBJECT)];

    it('taken from the latest check of a tool of the installation, in the installation\'s log', () => {
      expect(currentFilmToolWait(wait, latestToolChecks([checked('vault', LATER)]), LISTED)?.checkedAt).toEqual(LATER);
    });

    it('taken from the latest check of a tool of the project, in the project\'s log', () => {
      const project = [record(1, FILM_TOOLS_UNAVAILABLE_EVENT, { ...UNAVAILABLE, scope: 'project' }, START, FILM_TOOLS_SUBJECT), checked('vault', LATER)];
      expect(currentFilmToolWait(project, new Map(), LISTED)?.checkedAt).toEqual(LATER);
    });

    it('not taken from the checks of the other scope, nor from another tool, nor from a check older than the record', () => {
      const installationChecks = latestToolChecks([checked('vault', LATER)]);
      const ofProject = [record(1, FILM_TOOLS_UNAVAILABLE_EVENT, { ...UNAVAILABLE, scope: 'project' }, START, FILM_TOOLS_SUBJECT)];
      expect(currentFilmToolWait(ofProject, installationChecks, LISTED)?.checkedAt).toEqual(START);
      expect(currentFilmToolWait(wait, latestToolChecks([checked('registry', LATER)]), LISTED)?.checkedAt).toEqual(START);
      const recordedLater = [record(1, FILM_TOOLS_UNAVAILABLE_EVENT, UNAVAILABLE, LATER, FILM_TOOLS_SUBJECT)];
      expect(currentFilmToolWait(recordedLater, latestToolChecks([checked('vault', START)]), LISTED)?.checkedAt).toEqual(LATER);
    });

    it('is nothing when the films wait for no tool, or for one they do not list', () => {
      expect(currentFilmToolWait([], latestToolChecks([checked('vault', LATER)]), LISTED)).toBeNull();
      expect(currentFilmToolWait(wait, latestToolChecks([checked('vault', LATER)]), ['registry'])).toBeNull();
    });
  });
});
