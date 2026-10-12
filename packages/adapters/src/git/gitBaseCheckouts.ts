import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BaseCheckout, BaseCheckouts, CommandRunner } from '@agent-factory/application';
import { DEFAULT_REMOTE_NAME } from './constants.ts';
import { GitCommandError } from './errors.ts';
import { GitCli } from './gitCli.ts';
import { SerialQueue } from './serialQueue.ts';

const SAFE_CHECKOUT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PARENT_DIRECTORY_MARKER = '..';

export class UnsafeCheckoutNameError extends Error {
  constructor(name: string) {
    super(`"${name}" is not a safe checkout name`);
    this.name = 'UnsafeCheckoutNameError';
  }
}

export interface GitBaseCheckoutsSettings {
  readonly targetClonePath: string;
  readonly checkoutsDirectory: string;
  readonly baseBranch: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly remoteName?: string;
}

function assertSafeName(name: string): void {
  if (!SAFE_CHECKOUT_NAME.test(name) || name.includes(PARENT_DIRECTORY_MARKER)) throw new UnsafeCheckoutNameError(name);
}

export class GitBaseCheckouts implements BaseCheckouts {
  private readonly git: GitCli;
  private readonly queue = new SerialQueue();
  private readonly targetClonePath: string;
  private readonly checkoutsDirectory: string;
  private readonly baseBranch: string;
  private readonly remoteName: string;

  constructor(runner: CommandRunner, settings: GitBaseCheckoutsSettings) {
    this.git = new GitCli(runner, settings.environment);
    this.targetClonePath = resolve(settings.targetClonePath);
    this.checkoutsDirectory = resolve(settings.checkoutsDirectory);
    this.baseBranch = settings.baseBranch;
    this.remoteName = settings.remoteName ?? DEFAULT_REMOTE_NAME;
  }

  async checkout(name: string, revision?: string): Promise<BaseCheckout> {
    assertSafeName(name);
    return await this.queue.run(async () => {
      const path = join(this.checkoutsDirectory, name);
      const remoteBase = `${this.remoteName}/${this.baseBranch}`;
      await this.git.run(this.targetClonePath, ['fetch', this.remoteName, `+refs/heads/${this.baseBranch}:refs/remotes/${remoteBase}`]);
      await this.discard(path);
      await this.git.run(this.targetClonePath, ['worktree', 'add', '--detach', path, revision ?? remoteBase]);
      return { path, sha: await this.git.runTrimmed(path, ['rev-parse', 'HEAD']) };
    });
  }

  remove(checkout: BaseCheckout): Promise<void> {
    return this.queue.run(() => this.discard(resolve(checkout.path)));
  }

  private async discard(path: string): Promise<void> {
    try {
      await this.git.run(this.targetClonePath, ['worktree', 'remove', '--force', path]);
    } catch (error) {
      if (!(error instanceof GitCommandError)) throw error;
      await rm(path, { recursive: true, force: true });
    }
    await this.git.run(this.targetClonePath, ['worktree', 'prune']);
  }
}
