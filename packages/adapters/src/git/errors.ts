export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stderr: string;

  constructor(args: readonly string[], exitCode: number, stderr: string, timedOut: boolean) {
    const reason = timedOut ? 'timed out' : `exited with ${exitCode}`;
    super(`git ${args.join(' ')} ${reason}: ${stderr.trim()}`);
    this.name = 'GitCommandError';
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export class WorktreePoolExhaustedError extends Error {
  constructor(size: number) {
    super(`All ${size} worktree slots are leased`);
    this.name = 'WorktreePoolExhaustedError';
  }
}

export class InvalidPoolLocationError extends Error {
  constructor(poolDirectory: string, targetClonePath: string) {
    super(`Pool directory ${poolDirectory} must be outside the target clone ${targetClonePath}`);
    this.name = 'InvalidPoolLocationError';
  }
}

export class CorruptLeaseFileError extends Error {
  constructor(path: string, cause: unknown) {
    super(`Lease file ${path} is not valid`, { cause });
    this.name = 'CorruptLeaseFileError';
  }
}

export class BranchNotPushableError extends Error {
  readonly branch: string;

  constructor(branch: string, requiredPrefix: string) {
    super(`Refusing to push branch "${branch}": only branches starting with "${requiredPrefix}" may be pushed`);
    this.name = 'BranchNotPushableError';
    this.branch = branch;
  }
}

export class WorktreeBranchMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(`Worktree is on "${actual}" but the lease says "${expected}"`);
    this.name = 'WorktreeBranchMismatchError';
  }
}

export class NothingToCommitError extends Error {
  constructor() {
    super('The worktree has no change to commit');
    this.name = 'NothingToCommitError';
  }
}

export class PathOutsideWorktreeError extends Error {
  constructor(path: string) {
    super(`Path "${path}" is not inside the worktree`);
    this.name = 'PathOutsideWorktreeError';
  }
}
