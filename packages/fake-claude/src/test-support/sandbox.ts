import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Sandbox {
  readonly root: string;
  readonly worktree: string;
  readonly state: string;
  readonly scenarioFile: string;
  path(...segments: readonly string[]): string;
  writeScenario(scenario: unknown): Promise<void>;
  writeText(name: string, content: string): Promise<string>;
  writeScript(name: string, body: string): Promise<string>;
  dispose(): Promise<void>;
}

const DIRECTORY_PREFIX = 'fake-claude-';
const SCENARIO_FILE_NAME = 'scenario.json';
const EXECUTABLE_MODE = 0o755;
const JSON_INDENT = 2;

export async function createSandbox(): Promise<Sandbox> {
  const root = await realpath(await mkdtemp(join(tmpdir(), DIRECTORY_PREFIX)));
  const worktree = join(root, 'worktree');
  const state = join(root, 'state');
  await mkdir(worktree);
  const scenarioFile = join(root, SCENARIO_FILE_NAME);
  const path = (...segments: readonly string[]): string => join(root, ...segments);
  return {
    root,
    worktree,
    state,
    scenarioFile,
    path,
    writeScenario: (scenario) => writeFile(scenarioFile, JSON.stringify(scenario, null, JSON_INDENT)),
    writeText: async (name, content) => {
      await writeFile(path(name), content);
      return path(name);
    },
    writeScript: async (name, body) => {
      await writeFile(path(name), `#!/bin/sh\n${body}\n`);
      await chmod(path(name), EXECUTABLE_MODE);
      return path(name);
    },
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
