import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

const PATH_VARIABLE = 'PATH';
const DIRECTORY_SEPARATOR = '/';
const HOME_MARKER = '~';
/** What `execvp` searches when the environment sets no PATH. */
const DEFAULT_SEARCH_PATH = ['/usr/bin', '/bin'].join(delimiter);

export type CommandEnvironment = Readonly<Record<string, string | undefined>>;

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The executable file a program name stands for when a command starts in a directory with an environment, as `execvp`
 * finds it: a name with a slash is taken against the directory, a bare name is looked up along the PATH.
 */
export async function resolveExecutable(program: string, workingDirectory: string, environment: CommandEnvironment): Promise<string | null> {
  if (program.includes(DIRECTORY_SEPARATOR)) {
    const candidate = resolve(workingDirectory, program);
    return (await isExecutableFile(candidate)) ? candidate : null;
  }
  for (const directory of (environment[PATH_VARIABLE] ?? DEFAULT_SEARCH_PATH).split(delimiter)) {
    const candidate = join(resolve(workingDirectory, directory), program);
    if (await isExecutableFile(candidate)) return candidate;
  }
  return null;
}

/** Why a program cannot be started by a command that no shell interprets, in the words of the operator who wrote it. */
export function unresolvedProgramDetail(program: string, workingDirectory: string): string {
  if (program.startsWith(HOME_MARKER)) {
    return `the program ${program} starts with ${HOME_MARKER}, which no shell expands: the tokens of the command reach the program as they are, so write the absolute path`;
  }
  if (isAbsolute(program)) return `the program ${program} is not an executable file`;
  if (program.includes(DIRECTORY_SEPARATOR)) {
    return `the program ${program} is not an executable file (looked for ${resolve(workingDirectory, program)}, relative to the working directory)`;
  }
  return `the program ${program} is not on the PATH of the film command (the factory's environment with evidence.films.environment on top): give its absolute path or add its directory to PATH there`;
}
