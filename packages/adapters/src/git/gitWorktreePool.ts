import { access } from 'node:fs/promises';
import { join, relative, resolve, isAbsolute } from 'node:path';
import type { CommandRunner, Worktree, WorktreePool } from '@agent-factory/application';
import {
  DEFAULT_POOL_SIZE,
  DEFAULT_PRESERVED_DIRECTORIES,
  DEFAULT_REMOTE_NAME,
  LEASE_FILE_NAME,
  SLOT_DIRECTORY_PREFIX,
} from './constants.ts';
import { GitCommandError, InvalidPoolLocationError, WorktreePoolExhaustedError } from './errors.ts';
import { GitCli } from './gitCli.ts';
import { LeaseStore, type Lease } from './leaseStore.ts';
import { repositoryQueue, type SerialQueue } from './serialQueue.ts';

export interface GitWorktreePoolSettings {
  readonly targetClonePath: string;
  readonly poolDirectory: string;
  readonly repositoryName: string;
  readonly baseBranch: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly size?: number;
  readonly remoteName?: string;
  readonly preservedDirectories?: readonly string[];
}

export class GitWorktreePool implements WorktreePool {
  private readonly git: GitCli;
  private readonly leases: LeaseStore;
  private readonly queue: SerialQueue;
  private readonly targetClonePath: string;
  private readonly poolRoot: string;
  private readonly baseBranch: string;
  private readonly size: number;
  private readonly remoteName: string;
  private readonly preservedDirectories: readonly string[];

  constructor(runner: CommandRunner, settings: GitWorktreePoolSettings) {
    this.targetClonePath = resolve(settings.targetClonePath);
    this.queue = repositoryQueue(this.targetClonePath);
    this.poolRoot = resolve(settings.poolDirectory, settings.repositoryName);
    if (isInside(this.targetClonePath, this.poolRoot)) {
      throw new InvalidPoolLocationError(this.poolRoot, this.targetClonePath);
    }
    this.git = new GitCli(runner, settings.environment);
    this.leases = new LeaseStore(join(this.poolRoot, LEASE_FILE_NAME));
    this.baseBranch = settings.baseBranch;
    this.size = settings.size ?? DEFAULT_POOL_SIZE;
    this.remoteName = settings.remoteName ?? DEFAULT_REMOTE_NAME;
    this.preservedDirectories = settings.preservedDirectories ?? DEFAULT_PRESERVED_DIRECTORIES;
  }

  acquire(issueNumber: number, branch: string): Promise<Worktree> {
    return this.queue.run(async () => {
      const current = await this.leases.read();
      const lease = this.leaseFor(current, issueNumber, branch);
      await this.leases.write([...current.filter((held) => held.slot !== lease.slot), lease]);
      try {
        return await this.prepare(lease);
      } catch (error) {
        await this.leases.write(current.filter((held) => held.slot !== lease.slot));
        throw error;
      }
    });
  }

  reattach(issueNumber: number, recorded: Worktree, knownCommit: string): Promise<Worktree | null> {
    return this.queue.run(async () => {
      const lease = (await this.leases.read()).find((held) => held.issueNumber === issueNumber);
      if (lease === undefined || lease.branch !== recorded.branch) return null;
      if (this.slotPath(lease.slot) !== resolve(recorded.path) || !(await this.isWorktree(recorded.path))) return null;
      const checkedOut = await this.git.runTrimmed(recorded.path, ['rev-parse', '--abbrev-ref', 'HEAD']);
      if (checkedOut !== recorded.branch) return null;
      const descends = (await this.isAncestorOfHead(recorded.path, recorded.baseSha)) && (await this.isAncestorOfHead(recorded.path, knownCommit));
      return descends ? recorded : null;
    });
  }

  release(worktree: Worktree): Promise<void> {
    return this.queue.run(async () => {
      const current = await this.leases.read();
      const remaining = current.filter((lease) => this.slotPath(lease.slot) !== resolve(worktree.path));
      if (remaining.length !== current.length) await this.leases.write(remaining);
    });
  }

  private leaseFor(current: readonly Lease[], issueNumber: number, branch: string): Lease {
    const own = current.find((lease) => lease.issueNumber === issueNumber);
    if (own !== undefined) return { ...own, branch };
    const taken = new Set(current.map((lease) => lease.slot));
    for (let slot = 0; slot < this.size; slot += 1) {
      if (!taken.has(slot)) return { slot, issueNumber, branch };
    }
    throw new WorktreePoolExhaustedError(this.size);
  }

  private async prepare(lease: Lease): Promise<Worktree> {
    const path = this.slotPath(lease.slot);
    const remoteBase = `${this.remoteName}/${this.baseBranch}`;
    await this.git.run(this.targetClonePath, ['fetch', this.remoteName]);
    if (await this.isWorktree(path)) {
      await this.discardLeftovers(path);
    } else {
      await this.git.run(this.targetClonePath, ['worktree', 'prune']);
      await this.git.run(this.targetClonePath, ['worktree', 'add', '--detach', '--force', path, remoteBase]);
    }
    await this.git.run(path, ['checkout', '-B', lease.branch, remoteBase]);
    await this.discardLeftovers(path);
    const baseSha = await this.git.runTrimmed(path, ['rev-parse', 'HEAD']);
    return { path, branch: lease.branch, baseSha };
  }

  private async discardLeftovers(path: string): Promise<void> {
    await this.git.run(path, ['reset', '--hard']);
    await this.git.run(path, ['clean', '-fdx', ...this.preservedDirectories.flatMap((name) => ['-e', name])]);
  }

  private slotPath(slot: number): string {
    return join(this.poolRoot, `${SLOT_DIRECTORY_PREFIX}${slot}`);
  }

  private async isAncestorOfHead(path: string, commit: string): Promise<boolean> {
    try {
      await this.git.run(path, ['merge-base', '--is-ancestor', commit, 'HEAD']);
      return true;
    } catch (error) {
      if (error instanceof GitCommandError) return false;
      throw error;
    }
  }

  private async isWorktree(path: string): Promise<boolean> {
    try {
      await access(join(path, '.git'));
      return true;
    } catch {
      return false;
    }
  }
}

function isInside(parent: string, candidate: string): boolean {
  const relation = relative(parent, candidate);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}
