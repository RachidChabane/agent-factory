import { describe, expect, it } from 'vitest';
import type { EventStore, FactoryEventRecord } from '../ports.ts';
import { parseProjectSubject, ProjectEventStore } from './project-event-store.ts';

class RecordingEventStore implements EventStore {
  readonly records: FactoryEventRecord[] = [];
  private readonly listeners: ((event: FactoryEventRecord) => void)[] = [];

  append(type: string, subject: string, payload: unknown): Promise<FactoryEventRecord> {
    const record = { sequence: this.records.length + 1, occurredAt: new Date(0), type, subject, payload };
    this.records.push(record);
    for (const listener of this.listeners) listener(record);
    return Promise.resolve(record);
  }

  read(subjectPrefix: string, afterSequence: number): Promise<readonly FactoryEventRecord[]> {
    return Promise.resolve(this.records.filter((record) => record.sequence > afterSequence && record.subject.startsWith(subjectPrefix)));
  }

  subscribe(listener: (event: FactoryEventRecord) => void): () => void {
    this.listeners.push(listener);
    return () => undefined;
  }
}

describe('ProjectEventStore', () => {
  it('stores a project event under its project and hands it back with the subject the project used', async () => {
    const log = new RecordingEventStore();
    const record = await new ProjectEventStore(log, 'storefront').append('issue.transitioned', 'issue/12', { to: 'implementing' });
    expect(log.records[0]?.subject).toBe('project/storefront/issue/12');
    expect(record).toMatchObject({ sequence: 1, subject: 'issue/12', type: 'issue.transitioned' });
  });

  it('never lets one project read the events of another, even one whose id extends it', async () => {
    const log = new RecordingEventStore();
    const shop = new ProjectEventStore(log, 'shop');
    const shopAdmin = new ProjectEventStore(log, 'shop-admin');
    await shop.append('issue.transitioned', 'issue/12', {});
    await shopAdmin.append('issue.transitioned', 'issue/12', {});
    await log.append('budget.usage-read', 'budget/primary', {});
    expect((await shop.read('', 0)).map((record) => record.sequence)).toEqual([1]);
    expect((await shopAdmin.read('issue/', 0)).map((record) => [record.sequence, record.subject])).toEqual([[2, 'issue/12']]);
  });

  it('keeps the global sequence numbers when reading after a sequence', async () => {
    const log = new RecordingEventStore();
    const shop = new ProjectEventStore(log, 'shop');
    const other = new ProjectEventStore(log, 'other');
    await shop.append('a', 'issue/1', {});
    await other.append('b', 'issue/1', {});
    await shop.append('c', 'issue/1', {});
    expect((await shop.read('issue/1', 1)).map((record) => [record.sequence, record.type])).toEqual([[3, 'c']]);
  });

  it('notifies a project only of its own events', async () => {
    const log = new RecordingEventStore();
    const shop = new ProjectEventStore(log, 'shop');
    const heard: string[] = [];
    shop.subscribe((record) => heard.push(record.subject));
    await new ProjectEventStore(log, 'other').append('a', 'issue/1', {});
    await shop.append('b', 'request/req-1', {});
    await log.append('c', 'run/r1', {});
    expect(heard).toEqual(['request/req-1']);
  });
});

describe('parseProjectSubject', () => {
  it('separates the project from the subject, and leaves installation subjects without a project', () => {
    expect(parseProjectSubject('project/storefront/issue/12')).toEqual({ project: 'storefront', subject: 'issue/12' });
    expect(parseProjectSubject('run/abc')).toEqual({ project: null, subject: 'run/abc' });
    expect(parseProjectSubject('project/storefront')).toEqual({ project: null, subject: 'project/storefront' });
  });
});
