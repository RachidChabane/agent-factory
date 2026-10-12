/** Defined with the merge order that recognises it; the gateways raise it when a head moved. */
export { PullRequestHeadMovedError } from '@agent-factory/application';

export class GitHubCommandError extends Error {
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stderr: string;
  readonly timedOut: boolean;

  constructor(args: readonly string[], exitCode: number, stderr: string, timedOut: boolean) {
    const reason = timedOut ? 'timed out' : `exited with ${exitCode}`;
    super(`gh ${args.join(' ')} ${reason}: ${stderr.trim()}`);
    this.name = 'GitHubCommandError';
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
    this.timedOut = timedOut;
  }
}

export class GitHubPayloadError extends Error {
  constructor(what: string, cause: unknown) {
    super(`Unexpected GitHub payload for ${what}`, { cause });
    this.name = 'GitHubPayloadError';
  }
}

export class CommitScanLimitError extends Error {
  constructor(branch: string, sinceSha: string, pages: number) {
    super(`Commit ${sinceSha} not found within ${pages} pages of ${branch}`);
    this.name = 'CommitScanLimitError';
  }
}
