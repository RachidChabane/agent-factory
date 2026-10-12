export class GitHubCommandError extends Error {
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stderr: string;

  constructor(args: readonly string[], exitCode: number, stderr: string, timedOut: boolean) {
    const reason = timedOut ? 'timed out' : `exited with ${exitCode}`;
    super(`gh ${args.join(' ')} ${reason}: ${stderr.trim()}`);
    this.name = 'GitHubCommandError';
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export class GitHubPayloadError extends Error {
  constructor(what: string, cause: unknown) {
    super(`Unexpected GitHub payload for ${what}`, { cause });
    this.name = 'GitHubPayloadError';
  }
}

export class PullRequestHeadMovedError extends Error {
  readonly expectedHeadSha: string;
  readonly actualHeadSha: string;

  constructor(pullRequestNumber: number, expectedHeadSha: string, actualHeadSha: string) {
    super(`Pull request #${pullRequestNumber} head is ${actualHeadSha}, expected ${expectedHeadSha}`);
    this.name = 'PullRequestHeadMovedError';
    this.expectedHeadSha = expectedHeadSha;
    this.actualHeadSha = actualHeadSha;
  }
}

export class CommitScanLimitError extends Error {
  constructor(branch: string, sinceSha: string, pages: number) {
    super(`Commit ${sinceSha} not found within ${pages} pages of ${branch}`);
    this.name = 'CommitScanLimitError';
  }
}
