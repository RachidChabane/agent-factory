import { describe, expect, it } from 'vitest';
import { CommandSpawnError, isMissingExecutable } from './errors.ts';

function failure(code: string): Error {
  return Object.assign(new Error(`spawn ${code}`), { code });
}

describe('isMissingExecutable', () => {
  it('recognises a command that could not start because its executable does not exist', () => {
    expect(isMissingExecutable(new CommandSpawnError(['git', '--version'], failure('ENOENT')))).toBe(true);
  });

  it.each(['EACCES', 'EMFILE', 'E2BIG'])('does not take a spawn failure with code %s for a missing executable', (code) => {
    expect(isMissingExecutable(new CommandSpawnError(['git'], failure(code)))).toBe(false);
  });

  it('does not take a spawn failure without a cause for a missing executable', () => {
    expect(isMissingExecutable(new CommandSpawnError(['git'], 'plain text'))).toBe(false);
  });

  it('answers only for the spawn failures of the command runner', () => {
    expect(isMissingExecutable(failure('ENOENT'))).toBe(false);
    expect(isMissingExecutable('ENOENT')).toBe(false);
    expect(isMissingExecutable(null)).toBe(false);
  });
});
