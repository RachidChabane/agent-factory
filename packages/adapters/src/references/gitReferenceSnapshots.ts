import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import {
  InvalidReferenceError,
  referenceSnapshotPath,
  ReferenceRevisionNotFoundError,
  ReferenceSourceUnreadableError,
  type CommandRunner,
  type ReferenceSnapshot,
  type ReferenceSnapshots,
  type ReferenceSource,
  type StoredSnapshot,
} from '@agent-factory/application';
import { referenceProblems, type ReferenceRepository } from '@agent-factory/domain';
import { GitCommandError } from '../git/errors.ts';
import { GitCli } from '../git/gitCli.ts';
import { SerialQueue } from '../git/serialQueue.ts';
import {
  COMMIT_ID_PATTERN,
  MISSING_FILE_CODES,
  REFERENCE_ARCHIVE_SUFFIX,
  REFERENCE_COMMAND_TIMEOUT_MS,
  REFERENCE_COMMIT_SUFFIX,
  REFERENCE_MARKER_MODE,
  REFERENCE_PARTIAL_SUFFIX,
  REFERENCE_RETIRED_SUFFIX,
  REVISION_COMMIT_SUFFIX,
  TAR_EXECUTABLE,
  UTF8,
} from './constants.ts';
import { makeFilesReadOnly } from './readOnlyTree.ts';

export interface GitReferenceSnapshotsSettings {
  /** The directory that holds the snapshots of one project. */
  readonly directory: string;
  readonly environment: Readonly<Record<string, string>>;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && MISSING_FILE_CODES.includes(error.code);
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (entry) => entry.isDirectory(),
    () => false,
  );
}

function assertSafe(reference: ReferenceRepository): void {
  const problems = referenceProblems(reference);
  if (problems.length > 0) throw new InvalidReferenceError(problems);
}

/**
 * The files of a local clone at a tag or a commit (`git archive`, no `.git`), extracted beside their final place, made read-only,
 * then renamed into `<directory>/<name>@<ref>`; the commit they come from is recorded in `<name>@<ref>.commit`. A snapshot is rebuilt
 * only when it is missing or the ref resolves to another commit, and the previous one stays until the new one is complete.
 */
export class GitReferenceSnapshots implements ReferenceSnapshots {
  private readonly runner: CommandRunner;
  private readonly git: GitCli;
  private readonly root: string;
  private readonly environment: Readonly<Record<string, string>>;
  private readonly queue = new SerialQueue();

  private constructor(runner: CommandRunner, root: string, environment: Readonly<Record<string, string>>) {
    this.runner = runner;
    this.git = new GitCli(runner, environment);
    this.root = root;
    this.environment = environment;
  }

  /** The directory is created, and held by its canonical path: the sandboxes name paths the way the system resolves them. */
  static async open(runner: CommandRunner, settings: GitReferenceSnapshotsSettings): Promise<GitReferenceSnapshots> {
    await mkdir(settings.directory, { recursive: true });
    return new GitReferenceSnapshots(runner, await realpath(settings.directory), settings.environment);
  }

  pathOf(reference: ReferenceRepository): string {
    assertSafe(reference);
    return referenceSnapshotPath(this.root, reference);
  }

  async inspect(reference: ReferenceRepository): Promise<StoredSnapshot> {
    const path = this.pathOf(reference);
    const commit = await this.recordedCommit(path);
    return { path, commit: commit !== null && (await isDirectory(path)) ? commit : null };
  }

  async resolve(reference: ReferenceSource): Promise<string | null> {
    assertSafe(reference);
    if (!(await isDirectory(reference.source))) throw new ReferenceSourceUnreadableError(reference.source, 'the path is not a directory');
    try {
      const commit = await this.git.runTrimmed(reference.source, ['rev-parse', '--verify', '--quiet', `${reference.ref}${REVISION_COMMIT_SUFFIX}`]);
      return COMMIT_ID_PATTERN.test(commit) ? commit : null;
    } catch (error) {
      if (!(error instanceof GitCommandError)) throw error;
      if (await this.isRepository(reference.source)) return null;
      throw new ReferenceSourceUnreadableError(reference.source, error.stderr.trim() || error.message);
    }
  }

  materialise(reference: ReferenceSource): Promise<ReferenceSnapshot> {
    return this.queue.run(async () => {
      const commit = await this.resolve(reference);
      if (commit === null) throw new ReferenceRevisionNotFoundError(reference, reference.source);
      const stored = await this.inspect(reference);
      const snapshot = { name: reference.name, repository: reference.repository, ref: reference.ref, commit, path: stored.path };
      if (stored.commit === commit) return { ...snapshot, change: 'unchanged' };
      await this.build(reference.source, commit, stored.path);
      return { ...snapshot, change: stored.commit === null ? 'created' : 'rebuilt' };
    });
  }

  private async isRepository(source: string): Promise<boolean> {
    const result = await this.git.runResult(source, ['rev-parse', '--git-dir']).catch(() => null);
    return result !== null && result.exitCode === 0;
  }

  private async build(source: string, commit: string, path: string): Promise<void> {
    const staging = await mkdtemp(`${path}${REFERENCE_PARTIAL_SUFFIX}-`);
    const archive = `${staging}${REFERENCE_ARCHIVE_SUFFIX}`;
    try {
      await this.git.run(source, ['archive', '--format=tar', '--output', archive, commit]);
      await this.extract(archive, staging);
      await makeFilesReadOnly(staging);
      await this.install(staging, path, commit);
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    } finally {
      await rm(archive, { force: true });
    }
  }

  private async extract(archive: string, destination: string): Promise<void> {
    const result = await this.runner.run([TAR_EXECUTABLE, '-xf', archive, '-C', destination], destination, REFERENCE_COMMAND_TIMEOUT_MS, this.environment);
    if (result.exitCode !== 0 || result.timedOut) throw new Error(`${TAR_EXECUTABLE} could not extract ${archive}: ${result.stderr.trim()}`);
  }

  /** The previous snapshot is set aside, not deleted, until the new one is in place; a failure brings it back. */
  private async install(staging: string, path: string, commit: string): Promise<void> {
    const retired = await this.retire(path);
    try {
      await rename(staging, path);
    } catch (error) {
      if (retired !== null) await rename(retired, path).catch(() => undefined);
      throw error;
    }
    await this.recordCommit(path, commit);
    if (retired !== null) await rm(retired, { recursive: true, force: true });
  }

  private async retire(path: string): Promise<string | null> {
    const retired = `${path}${REFERENCE_RETIRED_SUFFIX}-${randomUUID()}`;
    try {
      await rename(path, retired);
      return retired;
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  private commitFileOf(path: string): string {
    return `${path}${REFERENCE_COMMIT_SUFFIX}`;
  }

  private async recordCommit(path: string, commit: string): Promise<void> {
    const record = this.commitFileOf(path);
    const staged = `${record}${REFERENCE_PARTIAL_SUFFIX}-${randomUUID()}`;
    await writeFile(staged, `${commit}\n`, { mode: REFERENCE_MARKER_MODE });
    await rename(staged, record);
  }

  private async recordedCommit(path: string): Promise<string | null> {
    try {
      const text = (await readFile(this.commitFileOf(path), UTF8)).trim();
      return COMMIT_ID_PATTERN.test(text) ? text : null;
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }
}
