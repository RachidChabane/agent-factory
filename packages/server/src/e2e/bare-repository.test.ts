import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildGitEnvironment, localOnlyGitEnvironment, SpawnCommandRunner } from '@agent-factory/adapters';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BareRepository } from './bare-repository.ts';
import { ExpectationFailed } from './expectations.ts';

const GIT_TIMEOUT_MS = 30_000;
const IDENTITY = { GIT_AUTHOR_NAME: 'Example Factory', GIT_AUTHOR_EMAIL: 'factory@example.com', GIT_COMMITTER_NAME: 'Example Factory', GIT_COMMITTER_EMAIL: 'factory@example.com' };
const MODULE_CONTENT = "export const CATEGORIES = ['kitchen'];\n";
const FULL_SHA = /^[0-9a-f]{40}$/;

const runner = new SpawnCommandRunner();
const environment = { ...localOnlyGitEnvironment(buildGitEnvironment(process.env)), ...IDENTITY };
let root = '';
let repository = new BareRepository(runner, root, environment);

async function git(...args: readonly string[]): Promise<void> {
  const result = await runner.run(['git', ...args], root, GIT_TIMEOUT_MS, environment);
  if (result.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
}

async function commit(files: Readonly<Record<string, string>>, message: string): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  await git('add', '--all');
  await git('commit', '--quiet', '--message', message);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bare-repository-test-'));
  await git('init', '--quiet', '--initial-branch', 'main');
  await commit({ 'package.json': '{}\n', 'src/catalog.js': 'export const CATALOG = [];\n' }, 'feat: sell the first products');
  await commit({ 'src/categories.js': MODULE_CONTENT, '.evidence/1/diffstat.txt': '1 file changed\n' }, 'feat(repo): filter the catalogue by category (#2)');
  repository = new BareRepository(runner, join(root, '.git'), environment);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('BareRepository', () => {
  it('names the full sha of the commit a branch points at', async () => {
    expect(await repository.revision('main')).toMatch(FULL_SHA);
  });

  it('lists every file of the tree of a commit', async () => {
    expect(await repository.paths('main')).toEqual(['.evidence/1/diffstat.txt', 'package.json', 'src/catalog.js', 'src/categories.js']);
    expect(await repository.paths('main~1')).toEqual(['package.json', 'src/catalog.js']);
  });

  it('reads a file byte for byte, down to its last newline', async () => {
    expect(await repository.fileAt('main', 'src/categories.js')).toBe(MODULE_CONTENT);
  });

  it('reads the first line of the message of a commit', async () => {
    expect(await repository.subject('main')).toBe('feat(repo): filter the catalogue by category (#2)');
  });

  it('fails, saying which git command failed, on a name that is not in the repository', async () => {
    await expect(repository.revision('factory/9-missing')).rejects.toThrow(ExpectationFailed);
    await expect(repository.fileAt('main', 'src/missing.js')).rejects.toThrow('show main:src/missing.js succeeds');
  });
});
