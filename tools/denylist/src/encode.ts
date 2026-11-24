import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { argv, exit, stderr } from 'node:process';
import { digest, normalize, rollingHash } from './hashing.ts';
import { PATTERN_FILE_VERSION, PATTERNS_PATH, parseDenylistFile, type DenylistFile, type DenylistPattern } from './patterns.ts';

const SALT_BYTES = 16;
const UTF8 = 'utf8';
const HEX = 'hex';
const COMMENT_PREFIX = '#';
const FIELD_SEPARATOR = '\t';
const EXIT_USAGE = 2;
const JSON_INDENT = 2;

const USAGE = `Usage: encode.ts <plain-list>
Reads "category<TAB>term" lines (blank lines and # comments ignored) from a file kept outside the repository,
and rewrites tools/denylist/patterns.json, which git ignores, with salted hashes only. The existing salt is kept.`;

function currentSalt(): string {
  return existsSync(PATTERNS_PATH) ? parseDenylistFile(readFileSync(PATTERNS_PATH, UTF8)).salt : randomBytes(SALT_BYTES).toString(HEX);
}

function parsePlainList(text: string): readonly { category: string; term: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith(COMMENT_PREFIX))
    .map((line) => {
      const [category = '', term = ''] = line.split(FIELD_SEPARATOR);
      if (category === '' || term === '') {
        throw new Error(`malformed line (expected category<TAB>term): ${line.length} characters`);
      }
      return { category, term: normalize(term) };
    });
}

function encode(entries: readonly { category: string; term: string }[], salt: string): DenylistFile {
  const patterns: DenylistPattern[] = entries.map(({ category, term }) => ({
    category,
    length: term.length,
    rolling: rollingHash(term),
    sha256: digest(salt, term),
  }));
  patterns.sort((left, right) => left.sha256.localeCompare(right.sha256));
  return { version: PATTERN_FILE_VERSION, salt, patterns };
}

function main(): number {
  const [, , plainListPath] = argv;
  if (plainListPath === undefined) {
    stderr.write(`${USAGE}\n`);
    return EXIT_USAGE;
  }
  const file = encode(parsePlainList(readFileSync(plainListPath, UTF8)), currentSalt());
  writeFileSync(PATTERNS_PATH, `${JSON.stringify(file, null, JSON_INDENT)}\n`);
  stderr.write(`denylist: ${file.patterns.length} patterns encoded\n`);
  return 0;
}

exit(main());
