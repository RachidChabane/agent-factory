import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openEventDatabase, SqliteEventStore } from '@agent-factory/adapters';
import type { EventStore } from '@agent-factory/application';
import { EVENT_DATABASE_FILE } from '../install-paths.ts';
import { SystemClock } from '../system.ts';

const PRIVATE_DIRECTORY_MODE = 0o700;

export interface EventLog {
  readonly events: EventStore;
  close(): void;
}

/** The installation's one event log; each project reads and writes it through its own prefix. */
export function openEventLog(stateDirectory: string): EventLog {
  mkdirSync(stateDirectory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const database = openEventDatabase(join(stateDirectory, EVENT_DATABASE_FILE));
  return { events: new SqliteEventStore(database, new SystemClock()), close: () => database.close() };
}
