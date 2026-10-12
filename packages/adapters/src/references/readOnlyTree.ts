import { chmod, lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { REFERENCE_DIRECTORY_MODE, REFERENCE_FILE_MODE_MASK } from './constants.ts';

/** Takes every write permission off the files of a tree and leaves its directories searchable and owner-writable. */
export async function makeFilesReadOnly(root: string): Promise<void> {
  await chmod(root, REFERENCE_DIRECTORY_MODE);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await makeFilesReadOnly(path);
    } else if (entry.isFile()) {
      const { mode } = await lstat(path);
      await chmod(path, mode & REFERENCE_FILE_MODE_MASK);
    }
  }
}
