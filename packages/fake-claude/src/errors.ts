export const EXIT_CODES = {
  success: 0,
  unknownSession: 1,
  invalidInvocation: 2,
  internalError: 70,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export class FakeClaudeError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode) {
    super(message);
    this.name = 'FakeClaudeError';
    this.exitCode = exitCode;
  }
}

export function invalidInvocation(message: string): FakeClaudeError {
  return new FakeClaudeError(message, EXIT_CODES.invalidInvocation);
}

export function unknownSession(sessionId: string): FakeClaudeError {
  return new FakeClaudeError(`No conversation found with session ID: ${sessionId}`, EXIT_CODES.unknownSession);
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
