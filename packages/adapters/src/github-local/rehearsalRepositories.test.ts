import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localOnlyGitEnvironment } from '../git/remoteLocality.ts';
import { createTestRepositories, git, TEST_BASE_BRANCH, TEST_GIT_ENVIRONMENT, testRunner, type TestRepositories } from '../git/testSupport.ts';
import { RehearsalSetupError } from './errors.ts';
import { RehearsalRepositories, type RehearsalLayout } from './rehearsalRepositories.ts';

describe('RehearsalRepositories', () => {
  let repositories: TestRepositories;
  let layout: RehearsalLayout;
  const setup = (): RehearsalRepositories => new RehearsalRepositories(testRunner(), localOnlyGitEnvironment(TEST_GIT_ENVIRONMENT));

  beforeEach(async () => {
    repositories = await createTestRepositories();
    layout = {
      sourceClonePath: repositories.clone,
      bareRepositoryPath: join(repositories.root, 'home', 'github', 'target.git'),
      workingClonePath: join(repositories.root, 'home', 'clone'),
      baseBranch: TEST_BASE_BRANCH,
    };
  });
  afterEach(async () => {
    await repositories.cleanup();
  });

  it('mirrors the source into a remote-less bare repository and clones it', async () => {
    const sourceConfig = await readFile(join(repositories.clone, '.git', 'config'), 'utf8');
    const sourceRefs = git(repositories.clone, 'for-each-ref');

    const result = await setup().initialise(layout);

    expect(result).toEqual({ bareRepository: 'created', workingClone: 'created', baseSha: git(repositories.clone, 'rev-parse', TEST_BASE_BRANCH) });
    expect(git(layout.bareRepositoryPath, 'remote')).toBe('');
    expect(git(layout.workingClonePath, 'remote', '-v')).toBe(
      [`origin\t${layout.bareRepositoryPath} (fetch)`, `origin\t${layout.bareRepositoryPath} (push)`].join('\n'),
    );
    expect(await readFile(join(repositories.clone, '.git', 'config'), 'utf8')).toBe(sourceConfig);
    expect(git(repositories.clone, 'for-each-ref')).toBe(sourceRefs);
  });

  it('keeps an existing rehearsal on a second run', async () => {
    await setup().initialise(layout);
    expect(await setup().initialise(layout)).toMatchObject({ bareRepository: 'kept', workingClone: 'kept' });
  });

  it('resets the rehearsal base to the source base and leaves the source untouched', async () => {
    await setup().initialise(layout);
    const sourceRefs = git(repositories.clone, 'for-each-ref');
    const sourceBase = git(repositories.clone, 'rev-parse', TEST_BASE_BRANCH);
    git(layout.workingClonePath, 'commit', '--allow-empty', '--quiet', '-m', 'merged rehearsal pull request');
    git(layout.workingClonePath, 'push', '--quiet', 'origin', `HEAD:${TEST_BASE_BRANCH}`);
    expect(git(layout.bareRepositoryPath, 'rev-parse', TEST_BASE_BRANCH)).not.toBe(sourceBase);

    expect(await setup().resetBase(layout)).toBe(sourceBase);

    expect(git(layout.bareRepositoryPath, 'rev-parse', TEST_BASE_BRANCH)).toBe(sourceBase);
    expect(git(layout.workingClonePath, 'rev-parse', 'HEAD')).toBe(sourceBase);
    expect(git(layout.workingClonePath, 'rev-parse', `origin/${TEST_BASE_BRANCH}`)).toBe(sourceBase);
    expect(git(repositories.clone, 'for-each-ref')).toBe(sourceRefs);
  });

  it('refuses to reset a rehearsal that was never initialised', async () => {
    await expect(setup().resetBase(layout)).rejects.toThrow('run the rehearsal init first');
  });

  it('refuses to take over a directory that is not a clone of the rehearsal remote', async () => {
    await mkdir(layout.workingClonePath, { recursive: true });
    await expect(setup().initialise(layout)).rejects.toBeInstanceOf(RehearsalSetupError);
    await expect(setup().initialise({ ...layout, workingClonePath: repositories.clone })).rejects.toBeInstanceOf(RehearsalSetupError);
  });
});
