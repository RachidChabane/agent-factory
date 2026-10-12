import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { entriesOf, renderNotices } from './notices.ts';

const NOTICES_FILE = 'THIRD_PARTY_NOTICES.md';
const CHECK_FLAG = '--check';
const UTF8 = 'utf8';
const EXIT_STALE = 1;
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: UTF8 }).trim();
const listing: unknown = JSON.parse(execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], { cwd: root, encoding: UTF8, maxBuffer: MAX_BUFFER_BYTES }));
const notices = renderNotices(entriesOf(listing));
const path = join(root, NOTICES_FILE);

if (process.argv.includes(CHECK_FLAG)) {
  let current = '';
  try {
    current = readFileSync(path, UTF8);
  } catch {
    current = '';
  }
  if (current !== notices) {
    process.stderr.write(`${NOTICES_FILE} does not match the production dependencies; run script/third-party-notices\n`);
    process.exitCode = EXIT_STALE;
  }
} else {
  writeFileSync(path, notices);
}
