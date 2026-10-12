import { DatabaseSync } from 'node:sqlite';

export const EVENTS_TABLE = 'events';
export const JOURNAL_MODE_WAL = 'wal';
export const BUSY_TIMEOUT_MS = 5000;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} (
    sequence INTEGER PRIMARY KEY,
    occurred_at TEXT NOT NULL,
    type TEXT NOT NULL,
    subject TEXT NOT NULL,
    payload TEXT NOT NULL CHECK (json_valid(payload))
  );
  CREATE INDEX IF NOT EXISTS events_subject ON ${EVENTS_TABLE} (subject, sequence);
  CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON ${EVENTS_TABLE}
    BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON ${EVENTS_TABLE}
    BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
`;

export function openEventDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path);
  database.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  database.exec(`PRAGMA journal_mode = ${JOURNAL_MODE_WAL}`);
  database.exec(SCHEMA);
  return database;
}
