export class LocalGitHubFileError extends Error {
  readonly path: string;

  constructor(path: string, cause: unknown) {
    super(`The local GitHub file ${path} is not valid`, { cause });
    this.name = 'LocalGitHubFileError';
    this.path = path;
  }
}

export class LocalRecordNotFoundError extends Error {
  readonly number: number;

  constructor(kind: string, number: number) {
    super(`No local ${kind} #${number}`);
    this.name = 'LocalRecordNotFoundError';
    this.number = number;
  }
}

export class LocalPullRequestRefusedError extends Error {
  constructor(subject: string, reason: string) {
    super(`Pull request ${subject} refused: ${reason}`);
    this.name = 'LocalPullRequestRefusedError';
  }
}

export class LocalMergeConflictError extends Error {
  readonly pullRequestNumber: number;

  constructor(pullRequestNumber: number, detail: string) {
    super(`Pull request #${pullRequestNumber} does not merge cleanly: ${detail.trim()}`);
    this.name = 'LocalMergeConflictError';
    this.pullRequestNumber = pullRequestNumber;
  }
}

export class UnknownCommitError extends Error {
  constructor(branch: string, sha: string) {
    super(`Commit ${sha} is not in the history of ${branch}`);
    this.name = 'UnknownCommitError';
  }
}

export class GitTooOldError extends Error {
  constructor(found: string, required: readonly [number, number]) {
    super(`git ${required.join('.')} or later is required for local merges, found "${found.trim()}"`);
    this.name = 'GitTooOldError';
  }
}

export class RehearsalSetupError extends Error {
  constructor(detail: string) {
    super(`Rehearsal setup refused: ${detail}`);
    this.name = 'RehearsalSetupError';
  }
}
