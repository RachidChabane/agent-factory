const GLOB_SPECIAL = /[.+^${}()|[\]\\]/g;
const GLOBSTAR = '**';
const GLOBSTAR_DIRECTORY = '**/';
const GLOBSTAR_PLACEHOLDER = '\u0000';
const GLOBSTAR_DIRECTORY_PLACEHOLDER = '\u0001';

/**
 * A path glob as a regular expression: a single star and a question mark stay inside one path
 * segment, a double star crosses segments, and a double star followed by a slash also matches
 * no directory at all, so the glob for every Markdown file also matches a README at the root.
 */
export function globPattern(glob: string): RegExp {
  const escaped = glob
    .replaceAll(GLOBSTAR_DIRECTORY, GLOBSTAR_DIRECTORY_PLACEHOLDER)
    .replaceAll(GLOBSTAR, GLOBSTAR_PLACEHOLDER)
    .replace(GLOB_SPECIAL, '\\$&')
    .replaceAll('*', '[^/]*')
    .replaceAll('?', '[^/]')
    .replaceAll(GLOBSTAR_DIRECTORY_PLACEHOLDER, '(?:.*/)?')
    .replaceAll(GLOBSTAR_PLACEHOLDER, '.*');
  return new RegExp(`^${escaped}$`);
}

export function matchesAnyGlob(path: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globPattern(glob).test(path));
}

export function touchesAny(paths: readonly string[], globs: readonly string[]): boolean {
  const patterns = globs.map(globPattern);
  return paths.some((path) => patterns.some((pattern) => pattern.test(path)));
}
