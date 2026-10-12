export class SpecNotValidatedError extends Error {
  readonly issueNumber: number;

  constructor(issueNumber: number, label: string) {
    super(`Issue #${issueNumber} has no "${label}" label: only an operator-validated spec runs`);
    this.name = 'SpecNotValidatedError';
    this.issueNumber = issueNumber;
  }
}

export class PipelineStalledError extends Error {
  constructor(issueNumber: number, steps: number) {
    super(`Issue #${issueNumber} did not reach a stopping state within ${steps} steps`);
    this.name = 'PipelineStalledError';
  }
}

export class MissingJournalFactError extends Error {
  constructor(issueNumber: number, fact: string) {
    super(`Issue #${issueNumber} has no recorded ${fact} although its state requires one`);
    this.name = 'MissingJournalFactError';
  }
}

export class PullRequestNotFromFactoryError extends Error {
  constructor(pullRequestNumber: number) {
    super(`Pull request #${pullRequestNumber} was not opened by the factory`);
    this.name = 'PullRequestNotFromFactoryError';
  }
}

export class MergeRefusedError extends Error {
  readonly pullRequestNumber: number;

  constructor(pullRequestNumber: number, reason: string) {
    super(`Merge of pull request #${pullRequestNumber} refused: ${reason}`);
    this.name = 'MergeRefusedError';
    this.pullRequestNumber = pullRequestNumber;
  }
}

export class EscalationRequiredError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'EscalationRequiredError';
    this.reason = reason;
  }
}

export class WorktreeUnavailableError extends EscalationRequiredError {
  constructor(path: string) {
    super(`the worktree at ${path} is no longer leased on its branch with the recorded commits`);
    this.name = 'WorktreeUnavailableError';
  }
}

export class PipelineAbortedError extends Error {
  constructor(issueNumber: number) {
    super(`The pipeline of issue #${issueNumber} was stopped`);
    this.name = 'PipelineAbortedError';
  }
}

export class ResumeRefusedError extends Error {
  readonly issueNumber: number;

  constructor(issueNumber: number, reason: string) {
    super(`Issue #${issueNumber} cannot be resumed: ${reason}`);
    this.name = 'ResumeRefusedError';
    this.issueNumber = issueNumber;
  }
}

export class AbandonRefusedError extends Error {
  readonly issueNumber: number;

  constructor(issueNumber: number, reason: string) {
    super(`Issue #${issueNumber} cannot be abandoned: ${reason}`);
    this.name = 'AbandonRefusedError';
    this.issueNumber = issueNumber;
  }
}
