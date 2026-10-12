import { describe, expect, it } from 'vitest';
import { ExpectationFailed, expectContains, expectEqual, expectIncludesAll, expectMatch, expectSameItems, expectThat } from './expectations.ts';

function failureOf(check: () => void): ExpectationFailed {
  try {
    check();
  } catch (error) {
    if (error instanceof ExpectationFailed) return error;
    throw error;
  }
  throw new Error('the check did not fail');
}

describe('expectations', () => {
  it('names what was checked, what was expected and what was found', () => {
    const failure = failureOf(() => expectEqual('the issue is closed', 'closed', 'open'));
    expect(failure.message).toBe('the issue is closed\n  expected: closed\n  found:    open');
    expect(failure.expected).toBe('closed');
    expect(failure.found).toBe('open');
  });

  it('lines up a multi-line value under its label', () => {
    const failure = failureOf(() => expectThat(false, 'the command succeeds', 'exit code 0', 'exit code 1\nrefused: checks still running'));
    expect(failure.message).toBe('the command succeeds\n  expected: exit code 0\n  found:    exit code 1\n            refused: checks still running');
  });

  it('passes silently when the expectation holds', () => {
    expect(() => expectEqual('same', 1, 1)).not.toThrow();
    expect(() => expectContains('has a fragment', 'two', 'one two three')).not.toThrow();
    expect(() => expectSameItems('same items', ['a', 'b'], ['a', 'b'])).not.toThrow();
    expect(() => expectIncludesAll('all there', ['a'], ['b', 'a'])).not.toThrow();
  });

  it('fails a text without the fragment and shows the text', () => {
    const failure = failureOf(() => expectContains('the log shows an assertion', 'ERR_ASSERTION', 'ERR_MODULE_NOT_FOUND'));
    expect(failure.expected).toBe('a text containing "ERR_ASSERTION"');
    expect(failure.found).toBe('ERR_MODULE_NOT_FOUND');
  });

  it('returns the match of a pattern and fails a text that does not match', () => {
    expect(expectMatch('a number', /#(\d+)/, 'issue #12')[1]).toBe('12');
    expect(failureOf(() => expectMatch('a number', /#(\d+)/, 'no number here')).expected).toBe('a text matching /#(\\d+)/');
  });

  it('compares lists in order and says when one is empty', () => {
    expect(failureOf(() => expectSameItems('the steps', ['lint', 'unit'], ['unit', 'lint'])).found).toBe('unit, lint');
    expect(failureOf(() => expectSameItems('the steps', ['lint'], [])).found).toBe('(none)');
  });

  it('names the items missing from a list', () => {
    const failure = failureOf(() => expectIncludesAll('the bundle', ['a.txt', 'b.txt'], ['a.txt']));
    expect(failure.found).toBe('a.txt; missing b.txt');
  });
});
