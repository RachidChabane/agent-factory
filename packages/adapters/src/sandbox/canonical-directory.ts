import { realpathSync } from 'node:fs';

export function canonicalDirectory(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
