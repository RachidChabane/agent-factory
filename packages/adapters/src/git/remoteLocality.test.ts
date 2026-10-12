import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitCommandError } from './errors.ts';
import { GitCli } from './gitCli.ts';
import { isLocalRemoteUrl, localOnlyGitEnvironment, NonLocalRemoteError, RemoteLocalityGuard, RepositoryMissingError } from './remoteLocality.ts';
import { createTestRepositories, git, TEST_BASE_BRANCH, TEST_GIT_ENVIRONMENT, testRunner, type TestRepositories } from './testSupport.ts';

const SEGMENT = fc.stringMatching(/^[A-Za-z0-9._-]{1,12}$/);
const HOST = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}(\.[a-z]{2,4})?$/);

describe('isLocalRemoteUrl', () => {
  it('accepts absolute paths and file URLs only', () => {
    expect(isLocalRemoteUrl('/Users/op/.factory/github/storefront.git')).toBe(true);
    expect(isLocalRemoteUrl('file:///Users/op/remote.git')).toBe(true);
    for (const url of [
      'git@github.com:example-org/storefront.git',
      'https://github.com/example-org/storefront.git',
      'ssh://git@github.com/example-org/storefront.git',
      'file://server/share/repo.git',
      '//server/share/repo.git',
      '../relative/repo.git',
      'repo.git',
      'github.com:example-org/storefront.git',
    ]) {
      expect(isLocalRemoteUrl(url), url).toBe(false);
    }
  });

  it('accepts every absolute path', () => {
    fc.assert(fc.property(fc.array(SEGMENT, { minLength: 1, maxLength: 6 }), (segments) => {
      expect(isLocalRemoteUrl(`/${segments.join('/')}`)).toBe(true);
    }));
  });

  it('rejects every network URL and scp-like address', () => {
    const scheme = fc.constantFrom('ssh', 'https', 'http', 'git', 'ftp');
    const path = fc.array(SEGMENT, { minLength: 1, maxLength: 4 }).map((segments) => segments.join('/'));
    fc.assert(fc.property(scheme, HOST, path, (protocol, host, rest) => {
      expect(isLocalRemoteUrl(`${protocol}://${host}/${rest}`)).toBe(false);
    }));
    fc.assert(fc.property(fc.option(SEGMENT, { nil: undefined }), HOST, path, (user, host, rest) => {
      expect(isLocalRemoteUrl(`${user === undefined ? '' : `${user}@`}${host}:${rest}`)).toBe(false);
    }));
  });
});

describe('RemoteLocalityGuard', () => {
  let repositories: TestRepositories;
  const guard = (): RemoteLocalityGuard => new RemoteLocalityGuard(testRunner(), localOnlyGitEnvironment(TEST_GIT_ENVIRONMENT));

  beforeEach(async () => {
    repositories = await createTestRepositories();
  });
  afterEach(async () => {
    await repositories.cleanup();
  });

  it('accepts a clone whose only remote is a local bare repository', async () => {
    await expect(guard().assertLocalOnly([repositories.clone, repositories.remote])).resolves.toBeUndefined();
    expect(await guard().remoteUrls(repositories.clone)).toEqual([
      { repository: repositories.clone, remote: 'origin', direction: 'fetch', url: repositories.remote },
      { repository: repositories.clone, remote: 'origin', direction: 'push', url: repositories.remote },
    ]);
  });

  it('refuses a network remote and a network push URL', async () => {
    git(repositories.clone, 'remote', 'add', 'upstream', 'git@github.com:example-org/storefront.git');
    git(repositories.clone, 'remote', 'set-url', '--push', 'origin', 'https://github.com/example-org/storefront.git');
    const failure = await guard().assertLocalOnly([repositories.clone]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(NonLocalRemoteError);
    expect(failure instanceof NonLocalRemoteError ? failure.offending.map((entry) => `${entry.remote}:${entry.direction}`) : []).toEqual([
      'origin:push',
      'upstream:fetch',
      'upstream:push',
    ]);
  });

  it('refuses a repository that does not exist', async () => {
    await expect(guard().assertLocalOnly([repositories.clone, `${repositories.root}/missing.git`])).rejects.toBeInstanceOf(RepositoryMissingError);
  });

  it('sees through an insteadOf rewrite of a local path', async () => {
    git(repositories.clone, 'config', `url.ssh://example.invalid${repositories.remote}.insteadOf`, repositories.remote);
    await expect(guard().assertLocalOnly([repositories.clone])).rejects.toBeInstanceOf(NonLocalRemoteError);
  });

  it('makes git refuse every network transport', async () => {
    git(repositories.clone, 'remote', 'add', 'network', 'ssh://example.invalid/target.git');
    const cli = new GitCli(testRunner(), localOnlyGitEnvironment(TEST_GIT_ENVIRONMENT));
    const failure = await cli.run(repositories.clone, ['push', 'network', TEST_BASE_BRANCH]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GitCommandError);
    expect(failure instanceof GitCommandError ? failure.stderr : '').toMatch(/transport 'ssh' not allowed/);
  });
});
