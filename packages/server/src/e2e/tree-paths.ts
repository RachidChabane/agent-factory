export const PATH_SEPARATOR = '/';

/** The paths of a tree that lie below a directory, written relative to it. */
export function pathsUnder(directory: string, paths: readonly string[]): readonly string[] {
  const prefix = `${directory}${PATH_SEPARATOR}`;
  return paths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length));
}
