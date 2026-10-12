import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { EXAMPLES_DIRECTORY } from '../../demo-paths.ts';
import type { DemoProject } from '../../demo-world.ts';
import type { StoryFile } from '../story-types.ts';

const WORKSPACE_PREFIX = 'story-content-';
const EXCLUDED_EXAMPLE_ENTRIES: readonly string[] = ['node_modules', '.factory'];
const SHELL = '/bin/sh';
const SHELL_COMMAND_FLAG = '-c';
const COMMAND_TIMEOUT_MS = 60_000;
const INHERITED_NODE_VARIABLES: readonly string[] = ['NODE_OPTIONS', 'NODE_TEST_CONTEXT'];
const UTF8 = 'utf8';

export interface CommandResult {
  readonly exitCode: number;
  readonly output: string;
}

export class CommandDidNotFinishError extends Error {
  constructor(commandLine: string, reason: string) {
    super(`${commandLine} did not finish: ${reason}`);
    this.name = 'CommandDidNotFinishError';
  }
}

function isCopiedFromExample(path: string): boolean {
  return !EXCLUDED_EXAMPLE_ENTRIES.some((entry) => path.endsWith(`/${entry}`));
}

function environmentWithoutNodeOptions(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !INHERITED_NODE_VARIABLES.includes(name)));
}

/** A temporary copy of a project's repository: the example directory, then the files its history adds. */
export class StoryWorkspace {
  readonly directory: string;

  private constructor(directory: string) {
    this.directory = directory;
  }

  static create(project: DemoProject): StoryWorkspace {
    const workspace = new StoryWorkspace(realpathSync(mkdtempSync(join(tmpdir(), WORKSPACE_PREFIX))));
    cpSync(join(EXAMPLES_DIRECTORY, project.example), workspace.directory, { recursive: true, filter: isCopiedFromExample });
    for (const commit of project.history) {
      workspace.write(Object.entries(commit.files).map(([path, content]) => ({ path, content })));
    }
    return workspace;
  }

  write(files: readonly StoryFile[]): void {
    for (const file of files) {
      const target = join(this.directory, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content);
    }
  }

  remove(paths: readonly string[]): void {
    for (const path of paths) rmSync(join(this.directory, path), { recursive: true, force: true });
  }

  /** Node's reporters open their destination file without creating the directory it lives in. */
  ensureDirectory(path: string): void {
    mkdirSync(join(this.directory, path), { recursive: true });
  }

  read(path: string): string {
    return readFileSync(join(this.directory, path), UTF8);
  }

  /** The text of a file, or null when the workspace does not hold it. */
  readIfPresent(path: string): string | null {
    return existsSync(join(this.directory, path)) ? this.read(path) : null;
  }

  run(commandLine: string): CommandResult {
    const result = spawnSync(SHELL, [SHELL_COMMAND_FLAG, commandLine], {
      cwd: this.directory,
      env: environmentWithoutNodeOptions(),
      encoding: UTF8,
      timeout: COMMAND_TIMEOUT_MS,
    });
    if (result.error !== undefined) throw new CommandDidNotFinishError(commandLine, result.error.message);
    if (result.status === null) throw new CommandDidNotFinishError(commandLine, `it ended on signal ${result.signal}`);
    return { exitCode: result.status, output: `${result.stdout}${result.stderr}` };
  }

  dispose(): void {
    rmSync(this.directory, { recursive: true, force: true });
  }
}
