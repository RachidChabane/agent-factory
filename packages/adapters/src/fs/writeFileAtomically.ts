import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const TEMPORARY_SUFFIX = '.tmp';

/**
 * Replaces a file in one step, so that a reader sees the old content or the new, never part of it, and creates its directory
 * when it is missing. Each call writes its own temporary file, so two writers never share one.
 */
export async function writeFileAtomically(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}${TEMPORARY_SUFFIX}`;
  try {
    await writeFile(temporary, content);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
