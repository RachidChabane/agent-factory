import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LogArchive } from '@agent-factory/application';

export const ISSUE_LOG_DIRECTORY_PREFIX = 'issue-';
const SAFE_LOG_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LOG_FILE_MODE = 0o600;
const UTF8 = 'utf8';
const MISSING_FILE_CODE = 'ENOENT';

export class UnsafeLogNameError extends Error {
  constructor(name: string) {
    super(`Log name ${JSON.stringify(name)} is not a plain file name`);
    this.name = 'UnsafeLogNameError';
  }
}

export class FileLogArchive implements LogArchive {
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async write(issueNumber: number, name: string, content: string): Promise<string> {
    const path = this.pathOf(issueNumber, name);
    await mkdir(join(this.directory, `${ISSUE_LOG_DIRECTORY_PREFIX}${issueNumber}`), { recursive: true });
    await writeFile(path, content, { mode: LOG_FILE_MODE });
    return path;
  }

  async read(issueNumber: number, name: string): Promise<string | null> {
    try {
      return await readFile(this.pathOf(issueNumber, name), UTF8);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE) return null;
      throw error;
    }
  }

  private pathOf(issueNumber: number, name: string): string {
    if (!SAFE_LOG_NAME.test(name)) throw new UnsafeLogNameError(name);
    return join(this.directory, `${ISSUE_LOG_DIRECTORY_PREFIX}${issueNumber}`, name);
  }
}
