import type { FactoryEventRecord } from '@agent-factory/application';

export interface EventIndex {
  readonly records: readonly FactoryEventRecord[];
  readonly lastSequence: number;
  subject(subject: string): readonly FactoryEventRecord[];
  subjectsWithPrefix(prefix: string): readonly string[];
}

const NO_EVENTS: readonly FactoryEventRecord[] = [];
const NO_SEQUENCE = 0;

export function indexEvents(records: readonly FactoryEventRecord[]): EventIndex {
  const bySubject = new Map<string, FactoryEventRecord[]>();
  for (const record of records) {
    const list = bySubject.get(record.subject) ?? [];
    list.push(record);
    bySubject.set(record.subject, list);
  }
  return {
    records,
    lastSequence: records.at(-1)?.sequence ?? NO_SEQUENCE,
    subject: (subject) => bySubject.get(subject) ?? NO_EVENTS,
    subjectsWithPrefix: (prefix) => [...bySubject.keys()].filter((subject) => subject.startsWith(prefix)),
  };
}

export function iso(date: Date): string {
  return date.toISOString();
}

export function firstOf(records: readonly FactoryEventRecord[], type: string): FactoryEventRecord | null {
  return records.find((record) => record.type === type) ?? null;
}

export function lastOf(records: readonly FactoryEventRecord[], type: string): FactoryEventRecord | null {
  return records.findLast((record) => record.type === type) ?? null;
}

export function ofType(records: readonly FactoryEventRecord[], type: string): readonly FactoryEventRecord[] {
  return records.filter((record) => record.type === type);
}
