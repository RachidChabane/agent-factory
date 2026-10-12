import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clock, FactoryEventRecord } from '@agent-factory/application';
import { openEventDatabase } from './sqlite-database.ts';
import { SqliteEventStore } from './sqlite-event-store.ts';

class SteppingClock implements Clock {
  private tick = 0;
  now(): Date {
    this.tick += 1;
    return new Date(Date.UTC(2026, 0, 1, 0, 0, this.tick));
  }
}

let directory: string;
let databasePath: string;
let database: DatabaseSync;
let store: SqliteEventStore;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'factory-store-'));
  databasePath = join(directory, 'factory.db');
  database = openEventDatabase(databasePath);
  store = new SqliteEventStore(database, new SteppingClock());
});

afterEach(() => {
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('SqliteEventStore', () => {
  it('runs in WAL mode', () => {
    expect(database.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
  });

  it('appends with increasing sequence, injected clock and JSON payload', async () => {
    const first = await store.append('a.happened', 'issue/1', { n: 1, nested: ['x'] });
    const second = await store.append('a.happened', 'issue/1', null);
    expect(second.sequence).toBeGreaterThan(first.sequence);
    expect(first.occurredAt).toEqual(new Date('2026-01-01T00:00:01.000Z'));
    expect(first.payload).toEqual({ n: 1, nested: ['x'] });
    expect(second.payload).toBeNull();
  });

  it('reads by subject prefix after a sequence', async () => {
    const a = await store.append('t', 'issue/1', 'a');
    await store.append('t', 'run/9', 'b');
    const c = await store.append('t', 'issue/2', 'c');
    expect((await store.read('issue/', 0)).map((e) => e.payload)).toEqual(['a', 'c']);
    expect((await store.read('issue/', a.sequence)).map((e) => e.sequence)).toEqual([c.sequence]);
    expect(await store.read('release/', 0)).toEqual([]);
    expect(await store.read('', 0)).toHaveLength(3);
  });

  it('treats LIKE wildcards in a prefix literally', async () => {
    await store.append('t', 'issue/1', 1);
    expect(await store.read('%', 0)).toEqual([]);
  });

  it('notifies subscribers until they unsubscribe and survives failing listeners', async () => {
    const seen: FactoryEventRecord[] = [];
    store.subscribe(() => {
      throw new Error('listener failure');
    });
    const unsubscribe = store.subscribe((event) => seen.push(event));
    await store.append('t', 's', 1);
    unsubscribe();
    await store.append('t', 's', 2);
    expect(seen.map((e) => e.payload)).toEqual([1]);
  });

  it('refuses updates and deletes', async () => {
    await store.append('t', 's', 1);
    expect(() => database.exec("UPDATE events SET type = 'x'")).toThrow(/append-only/);
    expect(() => database.exec('DELETE FROM events')).toThrow(/append-only/);
  });

  it('persists across reopening the database file', async () => {
    await store.append('t', 's', { kept: true });
    database.close();
    database = openEventDatabase(databasePath);
    store = new SqliteEventStore(database, new SteppingClock());
    expect((await store.read('s', 0)).map((e) => e.payload)).toEqual([{ kept: true }]);
  });
});
