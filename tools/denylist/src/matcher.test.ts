import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { digest, highestPower, rollForward, rollingHash } from './hashing.ts';
import { DenylistMatcher, maskIntegrityValues } from './matcher.ts';
import { PATTERN_FILE_VERSION, parseDenylistFile, type DenylistFile } from './patterns.ts';

const SALT = '0123456789abcdef0123456789abcdef';
const RANDOM_TEXTS = 400;
const RANDOM_TEXT_MAX_LENGTH = 60;
const RANDOM_SEED = 20_261_012;
const ALPHABET = ['a', 'c', 'n', 'o', 's', 't', 'x', 'C', 'O', '\n'];

function denylist(entries: readonly (readonly [string, string])[]): DenylistFile {
  return {
    version: PATTERN_FILE_VERSION,
    salt: SALT,
    patterns: entries.map(([category, term]) => ({ category, length: term.length, rolling: rollingHash(term), sha256: digest(SALT, term) })),
  };
}

/** A small deterministic generator, so the randomised checks replay identically. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function randomText(random: () => number, alphabet: readonly string[], maxLength: number): string {
  const length = Math.floor(random() * maxLength);
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += alphabet[Math.floor(random() * alphabet.length)] ?? '';
  }
  return text;
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
    assert.deepEqual(matches, [{ category: 'organisation', offset: 19, length: 7, line: 1, column: 20 }]);
  });

  it('reports the line and column of every match', () => {
    const matches = matcher.findAll('first line\nsecond Quimby line\npath /home/jdoe/src');
    assert.deepEqual(
      matches.map(({ category, line, column }) => ({ category, line, column })),
      [
        { category: 'person', line: 2, column: 8 },
        { category: 'local-path', line: 3, column: 6 },
      ],
    );
  });

  it('finds nothing in clean text', () => {
    assert.deepEqual(matcher.findAll('An agentic software factory with a cockpit.'), []);
  });

  it('keeps offsets valid around characters whose lower case is longer', () => {
    assert.deepEqual(
      matcher.findAll('İ contoso').map((match) => match.offset),
      [2],
    );
  });

  it('ignores a term that only appears inside a subresource-integrity value', () => {
    const lockLine = 'resolution: {integrity: sha512-AbCcontosoXyZ0123456789abcdefghijklmnopQRSTUV+/w==}';
    assert.deepEqual(matcher.findAll(lockLine), []);
    assert.ok(!maskIntegrityValues(lockLine).includes('contoso'));
  });

  it('still finds a term next to an integrity value', () => {
    const lockLine = 'contoso: {integrity: sha512-AbC0123456789abcdefghijklmnopQRSTUV+/w==}';
    assert.deepEqual(
      matcher.findAll(lockLine).map((match) => match.offset),
      [0],
    );
  });

  it('agrees with a naive substring search on random text', () => {
    const random = seededRandom(RANDOM_SEED);
    for (let sample = 0; sample < RANDOM_TEXTS; sample += 1) {
      const text = randomText(random, ALPHABET, RANDOM_TEXT_MAX_LENGTH) + (sample % 3 === 0 ? 'ContosO' : '');
      const expected: number[] = [];
      const lower = text.toLowerCase();
      for (let index = lower.indexOf('contoso'); index !== -1; index = lower.indexOf('contoso', index + 1)) {
        expected.push(index);
      }
      assert.deepEqual(
        matcher.findAll(text).map((match) => match.offset),
        expected,
        text,
      );
    }
  });
});

describe('rolling hash', () => {
  it('rolls forward to the hash of the next window', () => {
    const random = seededRandom(RANDOM_SEED);
    const alphabet = [...'abcdefghijklmnopqrstuvwxyz0123456789/.-_ ÉÈ'];
    for (let sample = 0; sample < RANDOM_TEXTS; sample += 1) {
      const text = `${randomText(random, alphabet, RANDOM_TEXT_MAX_LENGTH)}xy`;
      const length = 1 + Math.floor(random() * Math.min(16, text.length - 1));
      const power = highestPower(length);
      let hash = rollingHash(text.slice(0, length));
      for (let offset = 1; offset + length <= text.length; offset += 1) {
        hash = rollForward(hash, text.charCodeAt(offset - 1), text.charCodeAt(offset + length - 1), power);
        assert.equal(hash, rollingHash(text.slice(offset, offset + length)));
      }
    }
  });
});

describe('parseDenylistFile', () => {
  it('accepts a well-formed file', () => {
    const file = denylist([['person', 'quimby']]);
    assert.deepEqual(parseDenylistFile(JSON.stringify(file)), file);
  });

  it('refuses a malformed digest with a message naming the field', () => {
    const file = { ...denylist([['person', 'quimby']]), patterns: [{ category: 'person', length: 6, rolling: 1, sha256: 'xyz' }] };
    assert.throws(() => parseDenylistFile(JSON.stringify(file)), /patterns\[0\]\.sha256/);
  });

  it('refuses an empty pattern list', () => {
    assert.throws(() => parseDenylistFile(JSON.stringify({ version: 1, salt: SALT, patterns: [] })), /non-empty/);
  });
});
