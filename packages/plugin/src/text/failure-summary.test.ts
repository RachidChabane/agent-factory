import { describe, expect, it } from 'vitest';
import { FAILURE_OUTPUT_TAIL_LINES, stripTerminalControls, summariseFailureOutput } from './failure-summary.ts';

describe('summariseFailureOutput', () => {
  it('keeps only the last lines of a long failing output', () => {
    const output = Array.from({ length: 200 }, (_, index) => `line ${String(index + 1)}`).join('\n');
    const summary = summariseFailureOutput(output);
    const lines = summary.split('\n');
    expect(lines).toHaveLength(FAILURE_OUTPUT_TAIL_LINES);
    expect(lines[0]).toBe('line 141');
    expect(lines.at(-1)).toBe('line 200');
  });

  it('removes colour codes and normalises carriage returns', () => {
    const output = '\u001b[31mFAIL\u001b[39m src/a.test.ts\r\n  expected 1 to be 2\r\n';
    expect(summariseFailureOutput(output)).toBe('FAIL src/a.test.ts\n  expected 1 to be 2');
  });

  it('removes terminal title sequences', () => {
    expect(stripTerminalControls('\u001b]0;title\u0007done')).toBe('done');
  });

  it('honours a smaller line budget', () => {
    expect(summariseFailureOutput('a\nb\nc\n', 2)).toBe('b\nc');
  });
});
