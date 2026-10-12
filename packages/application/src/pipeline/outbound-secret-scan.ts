import { describeSecretFindings, scanForSecrets, textDocument } from '@agent-factory/domain';
import type { ScanDocument, ScannedLine } from '@agent-factory/domain';
import type { KnownSecretSource } from '../ports.ts';
import { EscalationRequiredError } from './pipeline-errors.ts';

export const PULL_REQUEST_BODY_ORIGIN = 'pull request body';
export const PULL_REQUEST_TITLE_ORIGIN = 'pull request title';

const FILE_HEADER = 'diff --git ';
const NEW_FILE_MARKER = '+++ ';
const NEW_FILE_PREFIX = 'b/';
const DELETED_FILE = '/dev/null';
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const ADDED = '+';
const REMOVED = '-';
const NO_NEWLINE_MARKER = '\\';
const DECIMAL = 10;

interface DiffFile {
  readonly origin: string;
  readonly lines: ScannedLine[];
}

export function addedLines(diff: string): readonly ScanDocument[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let inHunk = false;
  let nextLine = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith(FILE_HEADER)) {
      current = null;
      inHunk = false;
      continue;
    }
    if (!inHunk && line.startsWith(NEW_FILE_MARKER)) {
      const path = line.slice(NEW_FILE_MARKER.length);
      current = path === DELETED_FILE ? null : { origin: path.startsWith(NEW_FILE_PREFIX) ? path.slice(NEW_FILE_PREFIX.length) : path, lines: [] };
      if (current !== null) files.push(current);
      continue;
    }
    const hunk = HUNK_HEADER.exec(line);
    if (hunk !== null) {
      inHunk = true;
      nextLine = Number.parseInt(hunk[1] ?? '0', DECIMAL);
      continue;
    }
    if (!inHunk || line.startsWith(NO_NEWLINE_MARKER)) continue;
    if (line.startsWith(REMOVED)) continue;
    if (line.startsWith(ADDED)) current?.lines.push({ number: nextLine, text: line.slice(ADDED.length) });
    nextLine += 1;
  }
  return files;
}

export interface OutboundContent {
  readonly diff?: string;
  readonly title?: string;
  readonly body?: string;
  /** Files about to be committed, each under the path it will have on the branch. */
  readonly documents?: readonly ScanDocument[];
}

export class OutboundSecretScan {
  private readonly source: KnownSecretSource;

  constructor(source: KnownSecretSource) {
    this.source = source;
  }

  async assertClean(content: OutboundContent, action: string): Promise<void> {
    const documents = [
      ...(content.diff === undefined ? [] : addedLines(content.diff)),
      ...(content.title === undefined ? [] : [textDocument(PULL_REQUEST_TITLE_ORIGIN, content.title)]),
      ...(content.body === undefined ? [] : [textDocument(PULL_REQUEST_BODY_ORIGIN, content.body)]),
      ...(content.documents ?? []),
    ];
    const findings = scanForSecrets(documents, await this.source.knownSecrets());
    if (findings.length === 0) return;
    throw new EscalationRequiredError(
      `the secret scan refused to ${action}; nothing left the machine. Remove these values from the branch and rotate any real credential among them:\n${describeSecretFindings(findings)}`,
    );
  }
}
