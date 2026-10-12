import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** What the screenshots are made from: the cockpit, the demonstration they play, the projects it works on, and the scripts that take them. */
export const INPUT_ROOTS = ['packages/cockpit/src', 'packages/cockpit/index.html', 'packages/server/src/demo', 'examples', 'script/screenshots', 'e2e/capture'] as const;
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', 'dist', '.factory', '.git']);
/** The unit tests of the packages and their fixtures prove the code and change no pixel of a screenshot. */
const GIT_LISTING_LIMIT_BYTES = 64 * 1024 * 1024;
const UNIT_TEST_FILES: readonly RegExp[] = [/^packages\/.*\.test\.tsx?$/, /^packages\/cockpit\/src\/test\//];

function filesUnder(root: string, path: string): string[] {
  const absolute = join(root, path);
  if (!statSync(absolute).isDirectory()) return [path];
  return readdirSync(absolute)
    .filter((entry) => !SKIPPED_DIRECTORIES.has(entry))
    .flatMap((entry) => filesUnder(root, join(path, entry)));
}

/** The files git would commit under the input roots, so that a file ignored on one machine cannot change the hash; null outside a git work tree. */
function filesOfGit(root: string): string[] | null {
  try {
    const listing = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...INPUT_ROOTS], { cwd: root, encoding: 'utf8', maxBuffer: GIT_LISTING_LIMIT_BYTES });
    return listing.split('\0').filter((path) => path.length > 0 && existsSync(join(root, path)));
  } catch {
    return null;
  }
}

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** The SHA-256 of every input file, by path from the repository root. */
export function inputDigests(root: string): Readonly<Record<string, string>> {
  const paths = (filesOfGit(root) ?? INPUT_ROOTS.flatMap((input) => filesUnder(root, input)))
    .map((path) => path.split(sep).join('/'))
    .filter((path) => !UNIT_TEST_FILES.some((unitTest) => unitTest.test(path)));
  return Object.fromEntries([...new Set(paths)].sort().map((path) => [path, sha256(readFileSync(join(root, path)))]));
}

/** One hash for all the inputs, which changes when any file is added, removed or edited. */
export function inputHash(digests: Readonly<Record<string, string>>): string {
  return sha256(Object.entries(digests).map(([path, digest]) => `${path}\0${digest}\n`).join(''));
}

export function imageDigest(path: string): { bytes: number; sha256: string } {
  const content = readFileSync(path);
  return { bytes: content.length, sha256: sha256(content) };
}

export function relativeToRoot(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}
