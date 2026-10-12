import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

const PARENT_SEGMENT = '..';

export function canonicalPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(canonicalPath(parent), basename(path));
  }
}

export function isWithin(directory: string, candidate: string): boolean {
  const offset = relative(directory, candidate);
  if (offset === '') {
    return true;
  }
  return !isAbsolute(offset) && offset !== PARENT_SEGMENT && !offset.startsWith(`${PARENT_SEGMENT}${sep}`);
}
