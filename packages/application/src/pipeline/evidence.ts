import type { IssueSpec, IssueTypeDefinition } from '@agent-factory/domain';
import type { AcceptanceManifest } from '../acceptance/acceptance-manifest.ts';
import { declaredOutputPaths, EVIDENCE_DIRECTORY } from '../acceptance/acceptance-manifest.ts';
import type { WorkspaceFiles, Worktree } from '../ports.ts';
import type { AcceptanceTestRow } from './acceptance-test-table.ts';
import type { CachedEvidence, EvidenceBundle, EvidenceFile, EvidencePhase } from './journal-events.ts';
import { tailLines } from './shell-commands.ts';

export const EVIDENCE_CACHE_ISSUE_PREFIX = 'issue-';
export const EVIDENCE_LOG_TAIL_LINES = 400;
export const BEFORE_LOG_FILE = 'before-log.txt';
export const AFTER_LOG_FILE = 'after-log.txt';
export const DIFF_STAT_FILE = 'diffstat.txt';
export const ACCEPTANCE_TESTS_FILE = 'acceptance-tests.json';
const JSON_INDENT = 2;
const ORDINAL_SEPARATOR = '-';

const PATH_SEPARATOR = '/';

export function evidenceCaption(path: string): string {
  return path.slice(path.lastIndexOf(PATH_SEPARATOR) + 1);
}

export function evidenceDirectory(issueNumber: number): string {
  return `${EVIDENCE_DIRECTORY}${PATH_SEPARATOR}${issueNumber}`;
}

export interface EvidenceBundleInput {
  readonly before: readonly CachedEvidence[];
  readonly after: readonly CachedEvidence[];
  readonly beforeLog: string | null;
  readonly afterLog: string;
  readonly diffStat: string;
  readonly acceptanceTests: readonly AcceptanceTestRow[];
}

export class EvidenceCollector {
  private readonly files: WorkspaceFiles;
  private readonly cacheDirectory: string;

  constructor(files: WorkspaceFiles, cacheDirectory: string) {
    this.files = files;
    this.cacheDirectory = cacheDirectory;
  }

  async capture(worktree: Worktree, issueNumber: number, phase: EvidencePhase, manifest: AcceptanceManifest): Promise<readonly CachedEvidence[]> {
    const cacheRoot = this.cacheRoot(issueNumber);
    return Promise.all(
      manifest.evidence.map(async (path) => {
        const cachedPath = `${phase}${PATH_SEPARATOR}${path}`;
        const copied = await this.files.copyFile(worktree.path, path, cacheRoot, cachedPath);
        return { path, caption: evidenceCaption(path), cachedPath: copied ? cachedPath : null };
      }),
    );
  }

  async clearOutputs(worktree: Worktree, manifest: AcceptanceManifest, type: IssueTypeDefinition): Promise<void> {
    for (const path of declaredOutputPaths(manifest, type)) await this.files.remove(worktree.path, path);
  }

  async writeBundle(worktree: Worktree, issueNumber: number, input: EvidenceBundleInput): Promise<EvidenceBundle> {
    const directory = evidenceDirectory(issueNumber);
    const cacheRoot = this.cacheRoot(issueNumber);
    const files: EvidenceFile[] = [];
    const missing: { phase: EvidencePhase; sourcePath: string }[] = [];
    const phases: readonly [EvidencePhase, readonly CachedEvidence[]][] = [
      ['before', input.before],
      ['after', input.after],
    ];
    for (const [phase, entries] of phases) {
      for (const [index, entry] of entries.entries()) {
        if (entry.cachedPath === null) {
          missing.push({ phase, sourcePath: entry.path });
          continue;
        }
        const bundlePath = `${directory}${PATH_SEPARATOR}${phase}${PATH_SEPARATOR}${index + 1}${ORDINAL_SEPARATOR}${evidenceCaption(entry.path)}`;
        const copied = await this.files.copyFile(cacheRoot, entry.cachedPath, worktree.path, bundlePath);
        if (copied) files.push({ phase, sourcePath: entry.path, bundlePath, caption: entry.caption });
        else missing.push({ phase, sourcePath: entry.path });
      }
    }
    const beforeLogPath = input.beforeLog === null ? null : `${directory}${PATH_SEPARATOR}${BEFORE_LOG_FILE}`;
    if (beforeLogPath !== null && input.beforeLog !== null) {
      await this.files.writeText(worktree.path, beforeLogPath, `${tailLines(input.beforeLog, EVIDENCE_LOG_TAIL_LINES)}\n`);
    }
    const afterLogPath = `${directory}${PATH_SEPARATOR}${AFTER_LOG_FILE}`;
    await this.files.writeText(worktree.path, afterLogPath, `${tailLines(input.afterLog, EVIDENCE_LOG_TAIL_LINES)}\n`);
    const diffStatPath = `${directory}${PATH_SEPARATOR}${DIFF_STAT_FILE}`;
    await this.files.writeText(worktree.path, diffStatPath, `${input.diffStat}\n`);
    const acceptanceTestsPath = input.acceptanceTests.length === 0 ? null : `${directory}${PATH_SEPARATOR}${ACCEPTANCE_TESTS_FILE}`;
    if (acceptanceTestsPath !== null) {
      await this.files.writeText(worktree.path, acceptanceTestsPath, `${JSON.stringify(input.acceptanceTests, null, JSON_INDENT)}\n`);
    }
    return { directory, beforeLogPath, afterLogPath, diffStatPath, acceptanceTestsPath, files, missing };
  }

  keepCommitted(bundle: EvidenceBundle, committedPaths: readonly string[]): EvidenceBundle {
    const committed = (path: string | null): string | null => (path !== null && committedPaths.includes(path) ? path : null);
    const kept = bundle.files.filter((file) => committedPaths.includes(file.bundlePath));
    const dropped = bundle.files.filter((file) => !committedPaths.includes(file.bundlePath));
    return {
      ...bundle,
      beforeLogPath: committed(bundle.beforeLogPath),
      afterLogPath: committed(bundle.afterLogPath),
      diffStatPath: committed(bundle.diffStatPath),
      acceptanceTestsPath: committed(bundle.acceptanceTestsPath),
      files: kept,
      missing: [...bundle.missing, ...dropped.map((file) => ({ phase: file.phase, sourcePath: file.sourcePath }))],
    };
  }

  private cacheRoot(issueNumber: number): string {
    return `${this.cacheDirectory}${PATH_SEPARATOR}${EVIDENCE_CACHE_ISSUE_PREFIX}${issueNumber}`;
  }
}
