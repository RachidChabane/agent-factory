import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import type { CommandRunner, SourceControl, Worktree } from '@agent-factory/application';
import type { FrozenCheck } from '@agent-factory/domain';
import { isFactoryBranch } from './branchPolicy.ts';
import { BASE_COPY_DIRECTORY_PREFIX, DEFAULT_REMOTE_NAME, NUL, SCRATCH_INDEX_FILE_NAME, SHA256_ALGORITHM } from './constants.ts';
import { BranchNotPushableError, NothingToCommitError, WorktreeBranchMismatchError } from './errors.ts';
import { toRelativeInside } from '../paths/inside-root.ts';
import { GitCli } from './gitCli.ts';

export interface GitIdentity {
  readonly name: string;
  readonly email: string;
}

export interface GitSourceControlSettings {
  readonly environment: Readonly<Record<string, string>>;
  readonly identity: GitIdentity;
  /** Only branches starting with this prefix are ever pushed. */
  readonly branchPrefix: string;
  readonly remoteName?: string;
  readonly scratchDirectory?: string;
}

const LITERAL_PATHSPECS_ENVIRONMENT = { GIT_LITERAL_PATHSPECS: '1' } as const;

export class GitSourceControl implements SourceControl {
  private readonly git: GitCli;
  private readonly identity: GitIdentity;
  private readonly remoteName: string;
  private readonly scratchDirectory: string;
  private readonly branchPrefix: string;

  constructor(runner: CommandRunner, settings: GitSourceControlSettings) {
    this.git = new GitCli(runner, settings.environment);
    this.identity = settings.identity;
    this.branchPrefix = settings.branchPrefix;
    this.remoteName = settings.remoteName ?? DEFAULT_REMOTE_NAME;
    this.scratchDirectory = settings.scratchDirectory ?? tmpdir();
  }

  headSha(worktree: Worktree): Promise<string> {
    return this.git.runTrimmed(worktree.path, ['rev-parse', 'HEAD']);
  }

  async changedFiles(worktree: Worktree): Promise<readonly string[]> {
    const tracked = await this.git.run(worktree.path, ['diff', '--name-only', '-z', worktree.baseSha]);
    const untracked = await this.git.run(worktree.path, ['ls-files', '--others', '--exclude-standard', '-z']);
    return [...new Set([...splitNul(tracked), ...splitNul(untracked)])].sort();
  }

  async diff(worktree: Worktree): Promise<string> {
    await this.git.run(worktree.path, ['add', '--intent-to-add', '--', '.']);
    return this.git.run(worktree.path, ['diff', '--no-color', '--no-ext-diff', worktree.baseSha]);
  }

  async isClean(worktree: Worktree): Promise<boolean> {
    return (await this.git.run(worktree.path, ['status', '--porcelain'])).trim() === '';
  }

  async commitAll(worktree: Worktree, message: string): Promise<string> {
    await this.git.run(worktree.path, ['add', '--all']);
    const staged = await this.git.run(worktree.path, ['status', '--porcelain']);
    if (staged.trim() === '') throw new NothingToCommitError();
    await this.git.run(
      worktree.path,
      ['-c', 'commit.gpgsign=false', 'commit', '--no-verify', '--message', message],
      {
        GIT_AUTHOR_NAME: this.identity.name,
        GIT_AUTHOR_EMAIL: this.identity.email,
        GIT_COMMITTER_NAME: this.identity.name,
        GIT_COMMITTER_EMAIL: this.identity.email,
      },
    );
    return this.headSha(worktree);
  }

  async commitPaths(worktree: Worktree, paths: readonly string[], message: string): Promise<string> {
    const relativePaths = paths.map((path) => toRelativeInside(worktree.path, path));
    await this.git.run(worktree.path, ['add', '--all', '--', ...relativePaths], LITERAL_PATHSPECS_ENVIRONMENT);
    const staged = await this.git.run(worktree.path, ['diff', '--cached', '--name-only', '--', ...relativePaths], LITERAL_PATHSPECS_ENVIRONMENT);
    if (staged.trim() === '') throw new NothingToCommitError();
    await this.git.run(
      worktree.path,
      ['-c', 'commit.gpgsign=false', 'commit', '--no-verify', '--only', '--message', message, '--', ...relativePaths],
      {
        ...LITERAL_PATHSPECS_ENVIRONMENT,
        GIT_AUTHOR_NAME: this.identity.name,
        GIT_AUTHOR_EMAIL: this.identity.email,
        GIT_COMMITTER_NAME: this.identity.name,
        GIT_COMMITTER_EMAIL: this.identity.email,
      },
    );
    return this.headSha(worktree);
  }

  async discardPaths(worktree: Worktree, paths: readonly string[]): Promise<void> {
    const relativePaths = paths.map((path) => toRelativeInside(worktree.path, path));
    const listing = await this.git.run(worktree.path, ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', ...relativePaths], LITERAL_PATHSPECS_ENVIRONMENT);
    const tracked = splitNul(listing);
    if (tracked.length > 0) await this.git.run(worktree.path, ['checkout', 'HEAD', '--', ...tracked], LITERAL_PATHSPECS_ENVIRONMENT);
    await this.git.run(worktree.path, ['clean', '-fdq', '--', ...relativePaths], LITERAL_PATHSPECS_ENVIRONMENT);
  }

  async hashFiles(worktree: Worktree, paths: readonly string[]): Promise<readonly FrozenCheck[]> {
    return Promise.all(
      paths.map(async (path) => {
        const relativePath = toRelativeInside(worktree.path, path);
        const content = await readFile(join(worktree.path, relativePath));
        return { path: relativePath.split(sep).join('/'), sha256: createHash(SHA256_ALGORITHM).update(content).digest('hex') };
      }),
    );
  }

  async push(worktree: Worktree): Promise<void> {
    if (!isFactoryBranch(worktree.branch, this.branchPrefix)) throw new BranchNotPushableError(worktree.branch, this.branchPrefix);
    const checkedOut = await this.git.runTrimmed(worktree.path, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (checkedOut !== worktree.branch) throw new WorktreeBranchMismatchError(worktree.branch, checkedOut);
    await this.git.run(worktree.path, ['push', '--no-verify', '--set-upstream', this.remoteName, worktree.branch]);
  }

  async checkoutBaseCopy(worktree: Worktree, paths: readonly string[]): Promise<string> {
    const destination = await mkdtemp(join(this.scratchDirectory, BASE_COPY_DIRECTORY_PREFIX));
    const indexDirectory = await mkdtemp(join(this.scratchDirectory, BASE_COPY_DIRECTORY_PREFIX));
    const relativePaths = paths.map((path) => toRelativeInside(worktree.path, path));
    const listing = await this.git.run(
      worktree.path,
      ['ls-tree', '-r', '--name-only', '-z', worktree.baseSha, '--', ...relativePaths],
      LITERAL_PATHSPECS_ENVIRONMENT,
    );
    const presentAtBase = splitNul(listing);
    try {
      if (presentAtBase.length > 0) {
        await this.git.run(
          worktree.path,
          [`--work-tree=${destination}`, 'checkout', worktree.baseSha, '--', ...presentAtBase],
          { ...LITERAL_PATHSPECS_ENVIRONMENT, GIT_INDEX_FILE: join(indexDirectory, SCRATCH_INDEX_FILE_NAME) },
        );
      }
    } finally {
      await rm(indexDirectory, { recursive: true, force: true });
    }
    return destination;
  }
}

function splitNul(output: string): string[] {
  return output.split(NUL).filter((entry) => entry !== '');
}
