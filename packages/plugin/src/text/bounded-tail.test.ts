import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BoundedTail, lastLines } from './bounded-tail.ts';

function lineCount(text: string): number {
  if (text === '') {
    return 0;
  }
  return text.replace(/\n$/, '').split('\n').length;
}

describe('BoundedTail', () => {
  it('keeps the last lines of streamed chunks', () => {
    const tail = new BoundedTail({ maxLines: 2, maxCharacters: 1_000 });
    tail.append('one\ntwo\nth');
    tail.append('ree\nfour\n');
    expect(tail.text()).toBe('three\nfour\n');
    expect(tail.truncated).toBe(true);
  });

  it('caps the retained characters even for a single long line', () => {
    const tail = new BoundedTail({ maxLines: 10, maxCharacters: 5 });
    tail.append('abcdefghij');
    expect(tail.text()).toBe('fghij');
  });

  it('reports no truncation while under its limits', () => {
    const tail = new BoundedTail({ maxLines: 3, maxCharacters: 100 });
    tail.append('a\nb\n');
    expect(tail.text()).toBe('a\nb\n');
    expect(tail.truncated).toBe(false);
  });

  it('always returns a suffix of the input within both limits', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ unit: fc.constantFrom('a', 'b', '\n') }), { maxLength: 20 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 40 }),
        (chunks, maxLines, maxCharacters) => {
          const tail = new BoundedTail({ maxLines, maxCharacters });
          chunks.forEach((chunk) => tail.append(chunk));
          const whole = chunks.join('');
          expect(whole.endsWith(tail.text())).toBe(true);
          expect(tail.text().length).toBeLessThanOrEqual(maxCharacters);
          expect(lineCount(tail.text())).toBeLessThanOrEqual(maxLines);
        },
      ),
    );
  });
});

describe('lastLines', () => {
  it('returns the whole text when it has fewer lines than requested', () => {
    expect(lastLines('a\nb', 5)).toBe('a\nb');
  });
});
