import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidTransitionError } from '@agent-factory/domain';
import { openEventDatabase } from './sqlite-database.ts';
import { SqliteEventStore } from './sqlite-event-store.ts';
import { EventSourcedIssueStateStore } from './sqlite-issue-state-store.ts';

let directory: string;
let database: DatabaseSync;
let events: SqliteEventStore;
let states: EventSourcedIssueStateStore;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'factory-issue-state-'));
  database = openEventDatabase(join(directory, 'factory.db'));
  events = new SqliteEventStore(database, { now: () => new Date('2026-01-01T00:00:00.000Z') });
  states = new EventSourcedIssueStateStore(events);
});

afterEach(() => {
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('EventSourcedIssueStateStore', () => {
  it('has no state for an unknown issue and starts at spec-draft only', async () => {
    expect(await states.get(1)).toBeNull();
    await expect(states.transition(1, 'implementing', 'x')).rejects.toBeInstanceOf(InvalidTransitionError);
    await states.transition(1, 'spec-draft', 'created');
    expect(await states.get(1)).toBe('spec-draft');
  });

  it('projects the current state from transitions and rejects undeclared ones', async () => {
    await states.transition(7, 'spec-draft', 'created');
    await states.transition(7, 'spec-validated', 'operator validated');
    await expect(states.transition(7, 'merged', 'skip')).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(await states.get(7)).toBe('spec-validated');
    const log = await events.read('issue/7', 0);
    expect(log.map((e) => e.type)).toEqual(['issue.transitioned', 'issue.transitioned']);
    expect(log[1]?.payload).toEqual({ from: 'spec-draft', to: 'spec-validated', reason: 'operator validated' });
  });

  it('keeps issues independent, including numbers sharing a prefix', async () => {
    await states.transition(1, 'spec-draft', 'a');
    await states.transition(12, 'spec-draft', 'b');
    await states.transition(12, 'spec-validated', 'c');
    expect(await states.get(1)).toBe('spec-draft');
    expect(await states.get(12)).toBe('spec-validated');
  });

  it('resumes from needs-human only to the recorded previous state', async () => {
    await states.transition(3, 'spec-draft', 'a');
    await states.transition(3, 'spec-validated', 'b');
    await states.transition(3, 'authoring-checks', 'c');
    await states.transition(3, 'needs-human', 'check contradicts spec');
    await expect(states.transition(3, 'spec-validated', 'wrong')).rejects.toBeInstanceOf(InvalidTransitionError);
    await states.transition(3, 'authoring-checks', 'operator resumed');
    expect(await states.get(3)).toBe('authoring-checks');
  });

  it('abandons an escalated issue for good', async () => {
    await states.transition(4, 'spec-draft', 'a');
    await states.transition(4, 'spec-validated', 'b');
    await states.transition(4, 'authoring-checks', 'c');
    await states.transition(4, 'needs-human', 'decision requested');
    await states.transition(4, 'abandoned', 'abandoned by alex: superseded');
    expect(await states.get(4)).toBe('abandoned');
    await expect(states.transition(4, 'authoring-checks', 'late resume')).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(states.transition(4, 'needs-human', 'late escalation')).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('never leaves closed', async () => {
    const path = ['spec-draft', 'spec-validated', 'authoring-checks', 'checks-frozen', 'implementing', 'gating',
      'reviewing', 'producing-evidence', 'pr-open', 'ci', 'ready-to-merge', 'merged', 'in-dev', 'in-release',
      'in-prep', 'in-prod', 'closed'] as const;
    for (const state of path) await states.transition(5, state, 'step');
    await expect(states.transition(5, 'needs-human', 'late')).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('serialises concurrent transitions on the same issue', async () => {
    await states.transition(9, 'spec-draft', 'a');
    const results = await Promise.allSettled([
      states.transition(9, 'spec-validated', 'one'),
      states.transition(9, 'spec-validated', 'two'),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
  });

  it('rebuilds state from the log with a fresh store instance', async () => {
    await states.transition(2, 'spec-draft', 'a');
    await states.transition(2, 'spec-validated', 'b');
    const reopened = new EventSourcedIssueStateStore(events);
    expect(await reopened.get(2)).toBe('spec-validated');
  });
});
