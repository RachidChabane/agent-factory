export class FilmRefusedError extends Error {
  readonly issueNumber: number;
  readonly reason: string;

  constructor(issueNumber: number, reason: string) {
    super(`Issue #${issueNumber} cannot be filmed: ${reason}`);
    this.name = 'FilmRefusedError';
    this.issueNumber = issueNumber;
    this.reason = reason;
  }
}

export class FilmRecordingError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'FilmRecordingError';
  }
}

/** What a film waits for: an agent run to end, or the machine to have memory. */
export const FILM_DEFERRAL_KINDS = ['agent-run', 'resources'] as const;
export type FilmDeferralKind = (typeof FILM_DEFERRAL_KINDS)[number];

/** The film cannot start yet; it stays queued. */
export class FilmDeferredError extends FilmRefusedError {
  readonly kind: FilmDeferralKind;

  constructor(issueNumber: number, kind: FilmDeferralKind, reason: string) {
    super(issueNumber, reason);
    this.name = 'FilmDeferredError';
    this.kind = kind;
  }
}

export class FilmBodyUpdateError extends Error {
  readonly issueNumber: number;

  constructor(issueNumber: number, reason: string) {
    super(`The film of issue #${issueNumber} ended but its pull request body could not be updated: ${reason}`);
    this.name = 'FilmBodyUpdateError';
    this.issueNumber = issueNumber;
  }
}
