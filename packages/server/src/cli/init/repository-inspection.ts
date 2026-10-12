import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { CommandRunner } from '@agent-factory/application';

export const INSPECTION_TIMEOUT_MS = 15_000;
const EXIT_CODE_OK = 0;
const UTF8 = 'utf8';
const ORIGIN_REMOTE = 'origin';
const GIT_SUFFIX = /\.git$/;
const GITHUB_REMOTE = /^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/git@|git@)github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;
const REMOTE_HEAD_PREFIX = 'origin/';
const DETACHED_HEAD = 'HEAD';
const MAX_MANIFEST_BYTES = 1_000_000;
const INSPECTED_DIRECTORIES: readonly string[] = ['.github', '.github/workflows'];

/** The files of a repository that detection looks at, by their path from the root. */
export interface RepositoryFiles {
  has(path: string): boolean;
  /** The text of a file, or null when the repository has no such file or it is too large to be a manifest. */
  text(path: string): Promise<string | null>;
}

export interface RepositoryFacts {
  readonly root: string;
  readonly name: string;
  /** The origin remote's URL, when the repository has one. */
  readonly originUrl: string | null;
  /** owner/name of the GitHub repository origin points at, or null when origin is not on GitHub. */
  readonly githubSlug: string | null;
  readonly defaultBranch: string;
  readonly identity: { readonly name: string; readonly email: string } | null;
  readonly files: RepositoryFiles;
}

export class NotARepositoryError extends Error {
  constructor(path: string, detail: string) {
    super(`${path} is not a git repository: ${detail}`);
    this.name = 'NotARepositoryError';
  }
}

export function githubSlugOf(url: string): string | null {
  const match = GITHUB_REMOTE.exec(url.trim());
  if (match === null) return null;
  const [, owner, name] = match;
  return owner === undefined || name === undefined ? null : `${owner}/${name.replace(GIT_SUFFIX, '')}`;
}

async function git(runner: CommandRunner, directory: string, environment: Readonly<Record<string, string>>, ...args: string[]): Promise<string | null> {
  try {
    const result = await runner.run(['git', '-C', directory, ...args], directory, INSPECTION_TIMEOUT_MS, environment);
    return result.exitCode === EXIT_CODE_OK && !result.timedOut ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}

async function defaultBranchOf(runner: CommandRunner, root: string, environment: Readonly<Record<string, string>>, fallback: string): Promise<string> {
  const remoteHead = await git(runner, root, environment, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD');
  if (remoteHead !== null && remoteHead.startsWith(REMOTE_HEAD_PREFIX)) return remoteHead.slice(REMOTE_HEAD_PREFIX.length);
  const current = await git(runner, root, environment, 'rev-parse', '--abbrev-ref', 'HEAD');
  return current === null || current === '' || current === DETACHED_HEAD ? fallback : current;
}

/** Lists the root, .github and its workflows; reads a listed file only when detection asks for it. */
export async function listRepositoryFiles(root: string, directories: readonly string[]): Promise<RepositoryFiles> {
  const paths = new Set<string>();
  const texts = new Map<string, string | null>();
  for (const directory of ['', ...directories]) {
    for (const entry of await readdir(join(root, directory)).catch(() => [])) paths.add(directory === '' ? entry : `${directory}/${entry}`);
  }
  return {
    has: (path) => paths.has(path),
    text: async (path) => {
      if (!paths.has(path)) return null;
      if (!texts.has(path)) {
        const entry = await stat(join(root, path)).catch(() => null);
        texts.set(path, entry?.isFile() === true && entry.size <= MAX_MANIFEST_BYTES ? await readFile(join(root, path), UTF8).catch(() => null) : null);
      }
      return texts.get(path) ?? null;
    },
  };
}

export async function inspectRepository(path: string, runner: CommandRunner, environment: Readonly<Record<string, string>>, fallbackBranch: string): Promise<RepositoryFacts> {
  const root = await git(runner, path, environment, 'rev-parse', '--show-toplevel');
  if (root === null) throw new NotARepositoryError(path, 'git rev-parse --show-toplevel failed');
  const originUrl = await git(runner, root, environment, 'remote', 'get-url', ORIGIN_REMOTE);
  const name = await git(runner, root, environment, 'config', 'user.name');
  const email = await git(runner, root, environment, 'config', 'user.email');
  const files = await listRepositoryFiles(root, INSPECTED_DIRECTORIES);
  return {
    root,
    name: basename(root),
    originUrl,
    githubSlug: originUrl === null ? null : githubSlugOf(originUrl),
    defaultBranch: await defaultBranchOf(runner, root, environment, fallbackBranch),
    identity: name === null || name === '' || email === null || email === '' ? null : { name, email },
    files,
  };
}
