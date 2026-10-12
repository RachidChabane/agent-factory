import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { digest, highestPower, rollForward, rollingHash } from './hashing.ts';
import { DenylistMatcher, maskIntegrityValues } from './matcher.ts';
import { PATTERN_FILE_VERSION, type DenylistFile } from './patterns.ts';

const SALT = '0123456789abcdef0123456789abcdef';

function denylist(entries: readonly (readonly [string, string])[]): DenylistFile {
  return {
    version: PATTERN_FILE_VERSION,
    salt: SALT,
    patterns: entries.map(([category, term]) => ({ category, length: term.length, rolling: rollingHash(term), sha256: digest(SALT, term) })),
  };
}

const matcher = new DenylistMatcher(
  denylist([
    ['organisation', 'contoso'],
    ['person', 'quimby'],
    ['local-path', '/home/jdoe'],
  ]),
);

describe('DenylistMatcher', () => {
  it('finds a term inside a longer word, whatever its case', () => {
    const matches = matcher.findAll('const label = "ACMEcontosoWidget";');
    expect(matches).toEqual([{ category: 'organisation', offset: 19, length: 7, line: 1, column: 20 }]);
  });

  it('reports the line and column of every match', () => {
    const matches = matcher.findAll('first line\nsecond Quimby line\npath /home/jdoe/src');
    expect(matches.map(({ category, line, column }) => ({ category, line, column }))).toEqual([
      { category: 'person', line: 2, column: 8 },
      { category: 'local-path', line: 3, column: 6 },
    ]);
  });

  it('finds nothing in clean text', () => {
    expect(matcher.findAll('An agentic software factory with a cockpit.')).toEqual([]);
  });

  it('ignores a term that only appears inside a subresource-integrity value', () => {
    const lockLine = 'resolution: {integrity: sha512-AbCcontosoXyZ0123456789abcdefghijklmnopQRSTUV+/w==}';
    expect(matcher.findAll(lockLine)).toEqual([]);
    expect(maskIntegrityValues(lockLine)).not.toContain('contoso');
  });

  it('still finds a term next to an integrity value', () => {
    const lockLine = 'contoso: {integrity: sha512-AbC0123456789abcdefghijklmnopQRSTUV+/w==}';
    expect(matcher.findAll(lockLine).map((match) => match.offset)).toEqual([0]);
  });

  it('agrees with a naive substring search on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom('a', 'c', 'n', 'o', 's', 't', 'x', 'C', 'O', '\n') }), (text) => {
        const expected: number[] = [];
        const lower = text.toLowerCase();
        for (let index = lower.indexOf('contoso'); index !== -1; index = lower.indexOf('contoso', index + 1)) {
          expected.push(index);
        }
        expect(matcher.findAll(text).map((match) => match.offset)).toEqual(expected);
      }),
    );
  });
});

describe('rolling hash', () => {
  it('rolls forward to the hash of the next window', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 2, maxLength: 64 }), fc.integer({ min: 1, max: 16 }), (text, rawLength) => {
        const length = Math.min(rawLength, text.length - 1);
        const power = highestPower(length);
        let hash = rollingHash(text.slice(0, length));
        for (let offset = 1; offset + length <= text.length; offset += 1) {
          hash = rollForward(hash, text.charCodeAt(offset - 1), text.charCodeAt(offset + length - 1), power);
          expect(hash).toBe(rollingHash(text.slice(offset, offset + length)));
        }
      }),
    );
  });
});
