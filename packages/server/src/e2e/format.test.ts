import { describe, expect, it } from 'vitest';
import { formatSeconds, hangingIndent, joinItems, joinWords, lastLines, shortSha } from './format.ts';

describe('format', () => {
  it('writes a duration in seconds with one decimal', () => {
    expect(formatSeconds(14_340)).toBe('14.3 s');
    expect(formatSeconds(0)).toBe('0.0 s');
  });

  it('shortens a commit sha to seven characters', () => {
    expect(shortSha('4961798ec085a3693f294496970c3b7926e925c8')).toBe('4961798');
  });

  it('keeps the last lines of a text', () => {
    expect(lastLines('one\ntwo\nthree\nfour', 2)).toBe('three\nfour');
    expect(lastLines('one', 5)).toBe('one');
  });

  it('writes items on one line and words as a command is typed', () => {
    expect(joinItems(['lint', 'unit'])).toBe('lint, unit');
    expect(joinWords(['agent-factory', 'status', '1'])).toBe('agent-factory status 1');
  });

  it('puts every line but the first behind a margin', () => {
    expect(hangingIndent('first\nsecond\nthird', '  ')).toBe('first\n  second\n  third');
    expect(hangingIndent('alone', '  ')).toBe('alone');
  });
});
