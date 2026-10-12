import { readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { HOME_PREFIX, PREFIX_WILDCARD } from './credential-paths.ts';

export interface PathPattern {
  readonly path: string;
  readonly prefix: boolean;
}

export class RelativePathPatternError extends Error {
  constructor(pattern: string) {
    super(`${JSON.stringify(pattern)} is neither absolute nor under ~/`);
    this.name = 'RelativePathPatternError';
  }
}

const PATH_SEPARATOR = '/';

export function parsePathPattern(pattern: string, home: string): PathPattern {
  const prefix = pattern.endsWith(PREFIX_WILDCARD);
  const literal = prefix ? pattern.slice(0, -PREFIX_WILDCARD.length) : pattern;
  const path = literal.startsWith(HOME_PREFIX) ? join(home, literal.slice(HOME_PREFIX.length)) : literal;
  if (!path.startsWith(PATH_SEPARATOR)) throw new RelativePathPatternError(pattern);
  return { path, prefix };
}

function canonical(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function prefixMatches(pattern: PathPattern): readonly string[] {
  try {
    const directory = dirname(pattern.path);
    const stem = basename(pattern.path);
    return readdirSync(directory)
      .filter((entry) => entry.startsWith(stem))
      .map((entry) => join(directory, entry));
  } catch {
    return [];
  }
}

export function concretePaths(patterns: readonly PathPattern[]): readonly string[] {
  const paths = patterns.flatMap((pattern) => (pattern.prefix ? prefixMatches(pattern) : [pattern.path]));
  const withTargets = paths.flatMap((path) => {
    const target = canonical(path);
    return target === null || target === path ? [path] : [path, target];
  });
  return [...new Set(withTargets)];
}
