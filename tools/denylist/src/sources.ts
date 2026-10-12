import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export interface ScanSubject {
  readonly label: string;
  readonly content: string;
}

const GIT = 'git';
const NUL = '\0';
const NEWLINE = '\n';
const UTF8 = 'utf8';
const MAX_BUFFER_BYTES = 1024 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8000;
const NUL_BYTE = 0;
const BLOB = 'blob';

function git(cwd: string, args: readonly string[], input?: string): Buffer {
  return execFileSync(GIT, args, { cwd, maxBuffer: MAX_BUFFER_BYTES, input, stdio: ['pipe', 'pipe', 'pipe'] });
}

function gitText(cwd: string, args: readonly string[], input?: string): string {
  return git(cwd, args, input).toString(UTF8);
}

export function isBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, BINARY_SNIFF_BYTES).includes(NUL_BYTE);
}

function textSubject(label: string, bytes: Buffer): readonly ScanSubject[] {
  return isBinary(bytes) ? [] : [{ label, content: bytes.toString(UTF8) }];
}

function pathSubject(label: string, path: string): ScanSubject {
  return { label: `${label} (path)`, content: path };
}

export function workingTreeSubjects(root: string): readonly ScanSubject[] {
  const paths = gitText(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split(NUL).filter(Boolean);
  return paths.flatMap((path) => {
    const bytes = readTracked(root, path);
    return [pathSubject(path, path), ...(bytes === null ? [] : textSubject(path, bytes))];
  });
}

function readTracked(root: string, path: string): Buffer | null {
  try {
    return readFileSync(`${root}/${path}`);
  } catch {
    return null;
  }
}

export function stagedSubjects(root: string): readonly ScanSubject[] {
  const paths = gitText(root, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']).split(NUL).filter(Boolean);
  return paths.flatMap((path) => [pathSubject(path, path), ...textSubject(`${path} (staged)`, git(root, ['show', `:${path}`]))]);
}

export function messageFileSubject(path: string): ScanSubject {
  return { label: 'commit message', content: readFileSync(path, UTF8) };
}

export function historySubjects(root: string, range: string | null): readonly ScanSubject[] {
  const revisions = range === null ? ['--all'] : [range];
  return [...commitMessageSubjects(root, revisions), ...blobSubjects(root, revisions), ...referenceSubjects(root)];
}

function commitMessageSubjects(root: string, revisions: readonly string[]): readonly ScanSubject[] {
  const records = gitText(root, ['log', ...revisions, `--format=%H%x00%an%x00%ae%x00%B%x00`]).split(`${NUL}${NEWLINE}`);
  return records
    .map((record) => record.split(NUL))
    .filter((fields) => fields.length >= 4 && fields[0] !== '')
    .map(([sha, author, email, body]) => ({ label: `commit ${sha?.slice(0, 12)} (message and author)`, content: `${author}\n${email}\n${body}` }));
}

function blobSubjects(root: string, revisions: readonly string[]): readonly ScanSubject[] {
  const objects = gitText(root, ['rev-list', '--objects', ...revisions])
    .split(NEWLINE)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(' ');
      return separator === -1 ? { sha: line, path: '' } : { sha: line.slice(0, separator), path: line.slice(separator + 1) };
    });
  if (objects.length === 0) {
    return [];
  }
  const pathBySha = new Map(objects.map((object) => [object.sha, object.path]));
  const subjects: ScanSubject[] = objects.filter((object) => object.path !== '').map((object) => pathSubject(`history:${object.path}`, object.path));
  const batch = git(root, ['cat-file', '--batch'], `${objects.map((object) => object.sha).join(NEWLINE)}${NEWLINE}`);
  let cursor = 0;
  while (cursor < batch.length) {
    const headerEnd = batch.indexOf(NEWLINE, cursor);
    const [sha = '', type = '', sizeText = '0'] = batch.subarray(cursor, headerEnd).toString(UTF8).split(' ');
    const size = Number.parseInt(sizeText, 10);
    const content = batch.subarray(headerEnd + 1, headerEnd + 1 + size);
    cursor = headerEnd + 1 + size + 1;
    if (type === BLOB) {
      subjects.push(...textSubject(`history:${pathBySha.get(sha) ?? sha} @ blob ${sha.slice(0, 12)}`, content));
    }
  }
  return subjects;
}

function referenceSubjects(root: string): readonly ScanSubject[] {
  const references = gitText(root, ['for-each-ref', '--format=%(refname)%00%(contents)']);
  return references === '' ? [] : [{ label: 'reference names and tag messages', content: references }];
}

export function pushRangeSubjects(root: string, localSha: string, remoteSha: string): readonly ScanSubject[] {
  const range = /^0+$/.test(remoteSha) ? localSha : `${remoteSha}..${localSha}`;
  return historySubjects(root, range);
}
