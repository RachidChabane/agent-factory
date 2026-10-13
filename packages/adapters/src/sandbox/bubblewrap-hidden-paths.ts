import { lstatSync, realpathSync, statSync } from 'node:fs';
import { concretePaths, expandedPaths, type PathPattern } from './path-patterns.ts';
import { isSafeSandboxPath } from './unsafe-sandbox-path.ts';

export interface HiddenPaths {
  readonly directories: readonly string[];
  readonly files: readonly string[];
}

interface PresentEntry {
  readonly path: string;
  readonly directory: boolean;
}

const PATH_SEPARATOR = '/';

function followedEntry(path: string): readonly PresentEntry[] {
  try {
    const canonical = realpathSync(path);
    return [{ path: canonical, directory: statSync(canonical).isDirectory() }];
  } catch {
    return [];
  }
}

function unfollowedEntry(path: string): readonly PresentEntry[] {
  if (!isSafeSandboxPath(path)) return [];
  try {
    const entry = lstatSync(path);
    return entry.isSymbolicLink() ? [] : [{ path, directory: entry.isDirectory() }];
  } catch {
    return [];
  }
}

export function isBeneath(path: string, directory: string): boolean {
  return path !== directory && path.startsWith(`${directory}${PATH_SEPARATOR}`);
}

function withoutCoveredEntries(entries: readonly PresentEntry[]): readonly PresentEntry[] {
  const directories = entries.filter((entry) => entry.directory).map((entry) => entry.path);
  return entries.filter((entry) => !directories.some((directory) => isBeneath(entry.path, directory)));
}

/**
 * The deniedReads are named by the operator in directories the operator owns: their links are followed and
 * an unsafe name is refused when the argument list is rendered. The hostRuntimePaths live in directories a
 * confined command can write, so an entry it plants there is taken at its face value or not at all: a link
 * is skipped rather than followed, and a name that cannot be written safely is skipped rather than refused.
 */
export function hiddenPaths(deniedReads: readonly PathPattern[], hostRuntimePaths: readonly PathPattern[] = []): HiddenPaths {
  const entries = [...concretePaths(deniedReads).flatMap(followedEntry), ...expandedPaths(hostRuntimePaths).flatMap(unfollowedEntry)];
  const outermost = withoutCoveredEntries([...new Map(entries.map((entry) => [entry.path, entry])).values()]);
  return {
    directories: outermost.filter((entry) => entry.directory).map((entry) => entry.path),
    files: outermost.filter((entry) => !entry.directory).map((entry) => entry.path),
  };
}
