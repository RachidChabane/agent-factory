import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { z } from 'zod';
import type { Clock, EventStore, FactoryEventRecord } from '@agent-factory/application';
import { EVENTS_TABLE } from './sqlite-database.ts';

const EventRowSchema = z.object({
  sequence: z.number().int(),
  occurred_at: z.string(),
  type: z.string(),
  subject: z.string(),
  payload: z.string(),
});

type Listener = (event: FactoryEventRecord) => void;

function toRecord(row: unknown): FactoryEventRecord {
  const parsed = EventRowSchema.parse(row);
  return {
    sequence: parsed.sequence,
    occurredAt: new Date(parsed.occurred_at),
    type: parsed.type,
    subject: parsed.subject,
    payload: JSON.parse(parsed.payload),
  };
}

export class SqliteEventStore implements EventStore {
  private readonly insert: StatementSync;
  private readonly select: StatementSync;
  private readonly listeners = new Set<Listener>();
  private readonly clock: Clock;

  constructor(database: DatabaseSync, clock: Clock) {
    this.clock = clock;
    this.insert = database.prepare(
      `INSERT INTO ${EVENTS_TABLE} (occurred_at, type, subject, payload) VALUES (?, ?, ?, ?)
       RETURNING sequence, occurred_at, type, subject, payload`,
    );
    this.select = database.prepare(
      `SELECT sequence, occurred_at, type, subject, payload FROM ${EVENTS_TABLE}
       WHERE sequence > ? AND substr(subject, 1, length(?)) = ? ORDER BY sequence`,
    );
  }

  append(type: string, subject: string, payload: unknown): Promise<FactoryEventRecord> {
    try {
      const serialized = JSON.stringify(payload) ?? 'null';
      const row = this.insert.get(this.clock.now().toISOString(), type, subject, serialized);
      const record = toRecord(row);
      this.notify(record);
      return Promise.resolve(record);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  read(subjectPrefix: string, afterSequence: number): Promise<readonly FactoryEventRecord[]> {
    try {
      return Promise.resolve(this.select.all(afterSequence, subjectPrefix, subjectPrefix).map(toRecord));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(record: FactoryEventRecord): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(record);
      } catch {
        continue;
      }
    }
  }
}
