import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';

export function canonicalDirectory(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * The canonical form of a directory that may not exist yet: its nearest existing ancestor, resolved, with the rest appended.
 * A relative path stays as given, so that the profile refuses it instead of reading it against the working directory.
 */
export function canonicalFutureDirectory(path: string): string {
  if (!isAbsolute(path)) return path;
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(canonicalFutureDirectory(parent), basename(path));
  }
}
