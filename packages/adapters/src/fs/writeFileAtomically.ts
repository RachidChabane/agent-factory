import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const TEMPORARY_SUFFIX = '.tmp';
const DEFAULT_DIRECTORY_MODE = 0o777;

export interface AtomicWriteOptions {
  /** The permissions of the directories the write has to create; the umask narrows them. */
  readonly directoryMode?: number;
}

/**
 * Replaces a file in one step, so that a reader sees the old content or the new, never part of it, and creates its directory
 * when it is missing. Each call writes its own temporary file, so two writers never share one.
 */
export async function writeFileAtomically(path: string, content: string, options: AtomicWriteOptions = {}): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: options.directoryMode ?? DEFAULT_DIRECTORY_MODE });
  const temporary = `${path}.${randomUUID()}${TEMPORARY_SUFFIX}`;
  try {
    await writeFile(temporary, content);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
