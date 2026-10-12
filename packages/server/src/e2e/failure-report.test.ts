import { describe, expect, it } from 'vitest';
import { ExpectationFailed } from './expectations.ts';
import type { CliRun } from './factory-cli.ts';
import { describeFailure, renderTranscript } from './failure-report.ts';

function run(overrides: Partial<CliRun>): CliRun {
  return { command: 'agent-factory status 1', exitCode: 0, output: '', durationMs: 300, timedOut: false, killed: false, ...overrides };
}

describe('describeFailure', () => {
  it('gives an expectation as it was worded', () => {
    expect(describeFailure(new ExpectationFailed('the issue is closed', 'closed', 'open'))).toBe('the issue is closed\n  expected: closed\n  found:    open');
  });

  it('gives any other error with its stack, and anything thrown that is not an error as text', () => {
    expect(describeFailure(new TypeError('boom'))).toContain('TypeError: boom');
    expect(describeFailure('plain text')).toBe('plain text');
  });
});

describe('renderTranscript', () => {
  it('shows each command with its exit code and what it printed', () => {
    const text = renderTranscript([run({ command: 'agent-factory merge 2 --expected-head abc', exitCode: 1, output: 'Merge refused\n', durationMs: 1_500 }), run({ output: '' })]);
    expect(text).toBe('$ agent-factory merge 2 --expected-head abc  (exit code 1, 1.5 s)\nMerge refused\n\n$ agent-factory status 1  (exit code 0, 0.3 s)\n(no output)');
  });

  it('says how a command that did not end by itself ended', () => {
    expect(renderTranscript([run({ command: 'agent-factory start', exitCode: -1, killed: true })])).toContain('(exit code -1, killed, 0.3 s)');
    expect(renderTranscript([run({ timedOut: true })])).toContain('timed out');
  });

  it('keeps the end of a long output', () => {
    const output = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join('\n');
    const text = renderTranscript([run({ output })]);
    expect(text).toContain('line 100');
    expect(text).not.toContain('line 50\n');
  });
});
