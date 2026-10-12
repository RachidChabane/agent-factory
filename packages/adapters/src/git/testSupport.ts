import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { buildGitEnvironment } from './gitEnvironment.ts';

export const TEST_BASE_BRANCH = 'main';
export const TEST_REPOSITORY_NAME = 'target';
export const TEST_IDENTITY = { name: 'Factory Bot', email: 'factory@example.test' } as const;
const TEST_SCRATCH_PREFIX = 'factory-git-test-';
const ISOLATED_CONFIG = '/dev/null';

export const TEST_GIT_ENVIRONMENT = {
  ...buildGitEnvironment(process.env),
  GIT_CONFIG_GLOBAL: ISOLATED_CONFIG,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Seed',
  GIT_AUTHOR_EMAIL: 'seed@example.test',
  GIT_COMMITTER_NAME: 'Seed',
  GIT_COMMITTER_EMAIL: 'seed@example.test',
};

export function testRunner(): SpawnCommandRunner {
  return new SpawnCommandRunner();
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: TEST_GIT_ENVIRONMENT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export async function writeRepositoryFile(root: string, path: string, content: string): Promise<void> {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

export interface TestRepositories {
  readonly root: string;
  readonly remote: string;
  readonly clone: string;
  readonly poolDirectory: string;
  readonly scratch: string;
  pushToRemote(path: string, content: string, message: string): Promise<void>;
  cleanup(): Promise<void>;
}

export async function createTestRepositories(): Promise<TestRepositories> {
  const root = await realpath(await mkdtemp(join(tmpdir(), TEST_SCRATCH_PREFIX)));
  const remote = join(root, 'remote.git');
  const clone = join(root, 'clone');
  const poolDirectory = join(root, 'pool');
  const scratch = join(root, 'scratch');
  const publisher = join(root, 'publisher');
  await mkdir(scratch, { recursive: true });
  git(root, 'init', '--bare', '--initial-branch', TEST_BASE_BRANCH, remote);
  git(root, 'clone', remote, publisher);
  git(publisher, 'checkout', '-b', TEST_BASE_BRANCH);
  await writeRepositoryFile(publisher, '.gitignore', 'node_modules/\n');
  await writeRepositoryFile(publisher, 'src/app.txt', 'base content\n');
  await writeRepositoryFile(publisher, 'checks/existing.test.txt', 'existing check\n');
  git(publisher, 'add', '--all');
  git(publisher, 'commit', '--message', 'seed');
  git(publisher, 'push', 'origin', TEST_BASE_BRANCH);
  git(root, 'clone', remote, clone);

  return {
    root,
    remote,
    clone,
    poolDirectory,
    scratch,
    async pushToRemote(path, content, message) {
      await writeRepositoryFile(publisher, path, content);
      git(publisher, 'add', '--all');
      git(publisher, 'commit', '--message', message);
      git(publisher, 'push', 'origin', TEST_BASE_BRANCH);
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
