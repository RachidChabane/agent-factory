import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hasErrorCode, invalidInvocation, unknownSession } from '../errors.ts';
import { SESSION_ID_PATTERN, sessionIdOf } from '../ids/deterministic-ids.ts';
import { parseJsonText, validateDocument } from '../json/json-file.ts';
import type { ScriptReference } from '../scenario/script-reference.ts';
import { parseSession, serializeSession, type SessionRecord } from './session-record.ts';
import type { SessionStore } from './session-store.ts';

export const SESSIONS_DIRECTORY = 'sessions';
export const TRANSCRIPTS_DIRECTORY = 'transcripts';

const SESSION_EXTENSION = '.json';
const TRANSCRIPT_EXTENSION = '.jsonl';
const TEMPORARY_EXTENSION = '.tmp';
const EXCLUSIVE_CREATE = 'wx';
const ALREADY_EXISTS = 'EEXIST';
const MISSING_FILE = 'ENOENT';
const FIRST_SESSION_NUMBER = 1;
const FIRST_RUN = 1;
const FIRST_SLOT = 0;
const SESSION_LABEL = 'session record';

/** Keeps one JSON record per session under a state directory shared by every process that uses it. */
export class FileSessionStore implements SessionStore {
  readonly #sessionsDirectory: string;
  readonly #transcriptsDirectory: string;

  constructor(stateDirectory: string) {
    this.#sessionsDirectory = join(stateDirectory, SESSIONS_DIRECTORY);
    this.#transcriptsDirectory = join(stateDirectory, TRANSCRIPTS_DIRECTORY);
  }

  async begin(script: ScriptReference): Promise<SessionRecord> {
    await this.#ensureDirectories();
    for (let number = FIRST_SESSION_NUMBER; ; number += 1) {
      const record: SessionRecord = { sessionId: sessionIdOf(number), script, nextSlot: FIRST_SLOT, runs: FIRST_RUN };
      if (await this.#claim(record)) {
        return record;
      }
    }
  }

  async resume(sessionId: string): Promise<SessionRecord> {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw unknownSession(sessionId);
    }
    await this.#ensureDirectories();
    const record = await this.#read(sessionId);
    const resumed: SessionRecord = { ...record, runs: record.runs + 1 };
    await this.save(resumed);
    return resumed;
  }

  async save(record: SessionRecord): Promise<void> {
    const file = this.#sessionFile(record.sessionId);
    const temporary = `${file}.${String(process.pid)}${TEMPORARY_EXTENSION}`;
    await writeFile(temporary, serializeSession(record));
    await rename(temporary, file);
  }

  transcriptPath(sessionId: string): string {
    return join(this.#transcriptsDirectory, `${sessionId}${TRANSCRIPT_EXTENSION}`);
  }

  #sessionFile(sessionId: string): string {
    return join(this.#sessionsDirectory, `${sessionId}${SESSION_EXTENSION}`);
  }

  async #ensureDirectories(): Promise<void> {
    await mkdir(this.#sessionsDirectory, { recursive: true });
    await mkdir(this.#transcriptsDirectory, { recursive: true });
  }

  async #claim(record: SessionRecord): Promise<boolean> {
    try {
      await writeFile(this.#sessionFile(record.sessionId), serializeSession(record), { flag: EXCLUSIVE_CREATE });
      return true;
    } catch (error) {
      if (hasErrorCode(error, ALREADY_EXISTS)) {
        return false;
      }
      throw error;
    }
  }

  async #read(sessionId: string): Promise<SessionRecord> {
    const file = this.#sessionFile(sessionId);
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      throw hasErrorCode(error, MISSING_FILE) ? unknownSession(sessionId) : invalidInvocation(`${SESSION_LABEL} ${file} cannot be read`);
    }
    const document = parseJsonText(text, file, SESSION_LABEL);
    return validateDocument(SESSION_LABEL, file, () => parseSession(document));
  }
}
