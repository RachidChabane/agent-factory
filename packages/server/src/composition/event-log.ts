import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EventSourcedIssueStateStore, openEventDatabase, SqliteEventStore } from '@agent-factory/adapters';
import type { EventStore, IssueStateStore } from '@agent-factory/application';
import type { FactoryConfig } from '../config/factory-config.ts';
import { EVENT_DATABASE_FILE } from './install-paths.ts';
import { SystemClock } from './system.ts';

const PRIVATE_DIRECTORY_MODE = 0o700;

export interface EventLog {
  readonly events: EventStore;
  readonly states: IssueStateStore;
  close(): void;
}

export function openEventLog(config: FactoryConfig): EventLog {
  mkdirSync(config.directories.state, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const database = openEventDatabase(join(config.directories.state, EVENT_DATABASE_FILE));
  const events = new SqliteEventStore(database, new SystemClock());
  return { events, states: new EventSourcedIssueStateStore(events), close: () => database.close() };
}
