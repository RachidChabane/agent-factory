import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FAILURE_LINE_SEPARATOR, FAILURE_TAIL_CHARACTERS, FAILURE_TAIL_LINES } from './constants.ts';
import { failureOf, failureTail } from './failureTail.ts';

const ESCAPE = String.fromCharCode(27);
const colored = (text: string): string => `${ESCAPE}[1;31m${text}${ESCAPE}[0m`;

describe('failureOf', () => {
  it('reports the error output rather than the progress lines of the standard output', () => {
    const stdout = `${colored('Apply complete! Resources: 0 added')}\n`;
    const stderr = 'evidence: memory pressure level is 2 after waiting 600s, expected 1\n';
    expect(failureOf({ stdout, stderr })).toBe('evidence: memory pressure level is 2 after waiting 600s, expected 1');
  });

  it('falls back to the standard output when the error output is blank', () => {
    expect(failureOf({ stdout: 'the session expired\n', stderr: ' \n' })).toBe('the session expired');
  });

  it('strips the colour codes of the output it reports', () => {
    expect(failureOf({ stdout: '', stderr: `${colored('Error')}: the session expired\n` })).toBe('Error: the session expired');
  });
});

describe('failureTail', () => {
  it('keeps the last lines, joined on one line, and skips blank ones', () => {
    const lines = Array.from({ length: FAILURE_TAIL_LINES + 3 }, (_, index) => `line ${index}`);
    const tail = failureTail(`${lines.join('\n\n')}\n`);
    expect(tail.split(FAILURE_LINE_SEPARATOR)).toEqual(lines.slice(-FAILURE_TAIL_LINES));
  });

  it('never exceeds the character bound, whatever the output', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 4_000 }), (output) => {
        expect(failureTail(output).length).toBeLessThanOrEqual(FAILURE_TAIL_CHARACTERS);
      }),
    );
  });
});
