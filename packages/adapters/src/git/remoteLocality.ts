import { access } from 'node:fs/promises';
import type { CommandRunner } from '@agent-factory/application';
import { GitCli } from './gitCli.ts';

export const LOCAL_FILE_URL_PREFIX = 'file:///';
export const LOCAL_ONLY_GIT_ENVIRONMENT: Readonly<Record<string, string>> = { GIT_ALLOW_PROTOCOL: 'file' };

const ABSOLUTE_PATH_PREFIX = '/';
const NETWORK_PATH_PREFIX = '//';
const LINE_BREAK = /\r?\n/;

export const REMOTE_DIRECTIONS = ['fetch', 'push'] as const;
export type RemoteDirection = (typeof REMOTE_DIRECTIONS)[number];

export interface RemoteUrl {
  readonly repository: string;
  readonly remote: string;
  readonly direction: RemoteDirection;
  readonly url: string;
}

export class NonLocalRemoteError extends Error {
  readonly offending: readonly RemoteUrl[];

  constructor(offending: readonly RemoteUrl[]) {
    super(
      `Refusing to rehearse: these remotes are not local paths: ${offending
        .map((entry) => `${entry.repository} ${entry.remote} (${entry.direction}) ${entry.url}`)
        .join('; ')}`,
    );
    this.name = 'NonLocalRemoteError';
    this.offending = offending;
  }
}

export class RepositoryMissingError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Refusing to rehearse: the repository ${path} does not exist`);
    this.name = 'RepositoryMissingError';
    this.path = path;
  }
}

export function isLocalRemoteUrl(url: string): boolean {
  if (url.startsWith(LOCAL_FILE_URL_PREFIX)) return true;
  return url.startsWith(ABSOLUTE_PATH_PREFIX) && !url.startsWith(NETWORK_PATH_PREFIX);
}

export function localOnlyGitEnvironment(environment: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return { ...environment, ...LOCAL_ONLY_GIT_ENVIRONMENT };
}

function lines(output: string): readonly string[] {
  return output
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

const DIRECTION_ARGUMENTS: Readonly<Record<RemoteDirection, readonly string[]>> = {
  fetch: ['remote', 'get-url', '--all'],
  push: ['remote', 'get-url', '--push', '--all'],
};

export class RemoteLocalityGuard {
  private readonly git: GitCli;

  constructor(runner: CommandRunner, environment: Readonly<Record<string, string>>) {
    this.git = new GitCli(runner, environment);
  }

  async remoteUrls(repository: string): Promise<readonly RemoteUrl[]> {
    const remotes = lines(await this.git.run(repository, ['remote']));
    const urls: RemoteUrl[] = [];
    for (const remote of remotes) {
      for (const direction of REMOTE_DIRECTIONS) {
        const output = await this.git.run(repository, [...DIRECTION_ARGUMENTS[direction], remote]);
        urls.push(...lines(output).map((url) => ({ repository, remote, direction, url })));
      }
    }
    return urls;
  }

  async assertLocalOnly(repositories: readonly string[]): Promise<void> {
    for (const repository of repositories) {
      await access(repository).catch(() => {
        throw new RepositoryMissingError(repository);
      });
      const offending = (await this.remoteUrls(repository)).filter((entry) => !isLocalRemoteUrl(entry.url));
      if (offending.length > 0) throw new NonLocalRemoteError(offending);
    }
  }
}
