const PATH_SEPARATOR = '/';
const PRIVATE_PREFIX = '/private';
const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export class TestReportFormatError extends Error {
  constructor(runner: string, detail: string) {
    super(`the ${runner} report is not readable: ${detail}`);
    this.name = 'TestReportFormatError';
  }
}

export function relativeToWorktree(path: string, worktreePath: string): string {
  for (const root of [worktreePath, `${PRIVATE_PREFIX}${worktreePath}`, worktreePath.replace(PRIVATE_PREFIX, '')]) {
    const prefix = root.endsWith(PATH_SEPARATOR) ? root : `${root}${PATH_SEPARATOR}`;
    if (path.startsWith(prefix)) return path.slice(prefix.length);
  }
  return path;
}

export function joinPath(directory: string, path: string): string {
  if (path.startsWith(PATH_SEPARATOR)) return path;
  return directory.endsWith(PATH_SEPARATOR) ? `${directory}${path}` : `${directory}${PATH_SEPARATOR}${path}`;
}

export function stripTerminalColours(text: string): string {
  return text.replace(ANSI_ESCAPE, '');
}
