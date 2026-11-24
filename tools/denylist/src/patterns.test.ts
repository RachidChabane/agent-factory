import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { digest, rollingHash } from './hashing.ts';
import { loadDenylist, PATTERN_FILE_VERSION, PATTERNS_VARIABLE, type DenylistFile } from './patterns.ts';

const SALT = '0123456789abcdef0123456789abcdef';

function fileGuarding(term: string): DenylistFile {
  return { version: PATTERN_FILE_VERSION, salt: SALT, patterns: [{ category: 'product', length: term.length, rolling: rollingHash(term), sha256: digest(SALT, term) }] };
}

describe('loadDenylist', () => {
  const directory = mkdtempSync(join(tmpdir(), 'denylist-'));
  const present = join(directory, 'patterns.json');
  const absent = join(directory, 'absent.json');
  writeFileSync(present, JSON.stringify(fileGuarding('fromfile')));
  after(() => rmSync(directory, { recursive: true, force: true }));

  it('reads the file when the variable is unset or blank', () => {
    assert.deepEqual(loadDenylist({}, present), fileGuarding('fromfile'));
    assert.deepEqual(loadDenylist({ [PATTERNS_VARIABLE]: '  ' }, present), fileGuarding('fromfile'));
  });

  it('prefers the content of the variable to the file', () => {
    assert.deepEqual(loadDenylist({ [PATTERNS_VARIABLE]: JSON.stringify(fileGuarding('fromvariable')) }, present), fileGuarding('fromvariable'));
  });

  it('returns null when there is neither a variable nor a file', () => {
    assert.equal(loadDenylist({}, absent), null);
  });

  it('refuses a variable that is not a pattern file', () => {
    assert.throws(() => loadDenylist({ [PATTERNS_VARIABLE]: '{"version":1}' }, absent), /invalid denylist pattern file/);
  });
});
