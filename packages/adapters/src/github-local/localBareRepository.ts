import type { CommandRunner, CommitDiff } from '@agent-factory/application';
import { GitCommandError } from '../git/errors.ts';
import { GitCli } from '../git/gitCli.ts';
import type { GitIdentity } from '../git/gitSourceControl.ts';
import { NUL } from '../git/constants.ts';
import { BRANCH_REF_PREFIX, MERGE_TREE_MINIMUM_GIT_VERSION, RECENT_COMMIT_LIMIT, TAG_REF_PREFIX } from './constants.ts';
import { GitTooOldError, UnknownCommitError } from './errors.ts';

const FIELD_SEPARATOR = '\x1f';
const RECORD_SEPARATOR = '\x1e';
const LOG_FORMAT = `--format=%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%cI${FIELD_SEPARATOR}%B${RECORD_SEPARATOR}`;
const MERGE_TREE_CONFLICT_EXIT_CODE = 1;
const GIT_VERSION_PATTERN = /(\d+)\.(\d+)/;
const NEWLINE = '\n';
const FORMAT_NUL = '%00';
const TAG_LIST_FORMAT = `--format=%(refname:short)${FORMAT_NUL}%(objectname)${FORMAT_NUL}%(*objectname)`;

export interface LocalCommit {
  readonly sha: string;
  readonly authorName: string;
  readonly committedAt: Date;
  readonly message: string;
}

export interface LocalTag {
  readonly name: string;
  readonly sha: string;
}

export type SquashResult =
  | { readonly kind: 'merged'; readonly sha: string }
  | { readonly kind: 'conflict'; readonly detail: string };

export interface LocalBareRepositorySettings {
  readonly path: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly identity: GitIdentity;
}

function identityEnvironment(identity: GitIdentity): Readonly<Record<string, string>> {
  return {
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  };
}

function parseCommits(output: string): readonly LocalCommit[] {
  return output
    .split(RECORD_SEPARATOR)
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record !== '')
    .map((record) => {
      const [sha = '', authorName = '', committedAt = '', ...message] = record.split(FIELD_SEPARATOR);
      return { sha, authorName, committedAt: new Date(committedAt), message: message.join(FIELD_SEPARATOR).trimEnd() };
    });
}

export class LocalBareRepository {
  private readonly git: GitCli;
  private readonly path: string;
  private readonly identity: GitIdentity;
  private versionChecked = false;

  constructor(runner: CommandRunner, settings: LocalBareRepositorySettings) {
    this.git = new GitCli(runner, settings.environment);
    this.path = settings.path;
    this.identity = settings.identity;
  }

  async branchHead(branch: string): Promise<string | null> {
    try {
      return await this.git.runTrimmed(this.path, ['rev-parse', '--verify', '--quiet', `${BRANCH_REF_PREFIX}${branch}^{commit}`]);
    } catch (error) {
      if (error instanceof GitCommandError) return null;
      throw error;
    }
  }

  async subjectsBetween(base: string, head: string): Promise<readonly string[]> {
    const output = await this.git.run(this.path, ['log', '--reverse', '--format=%s', `${base}..${head}`]);
    return output.split(NEWLINE).filter((line) => line !== '');
  }

  async squash(baseBranch: string, baseSha: string, headSha: string, message: string): Promise<SquashResult> {
    await this.assertMergeTreeSupported();
    const merged = await this.git.runResult(this.path, ['merge-tree', '--write-tree', '--name-only', baseSha, headSha]);
    if (merged.exitCode === MERGE_TREE_CONFLICT_EXIT_CODE) return { kind: 'conflict', detail: merged.stdout };
    if (merged.exitCode !== 0) throw new GitCommandError(['merge-tree', baseSha, headSha], merged.exitCode, merged.stderr, merged.timedOut);
    const tree = merged.stdout.split(NEWLINE)[0]?.trim() ?? '';
    const commit = (
      await this.git.run(this.path, ['commit-tree', tree, '-p', baseSha, '-m', message], identityEnvironment(this.identity))
    ).trim();
    await this.git.run(this.path, ['update-ref', `${BRANCH_REF_PREFIX}${baseBranch}`, commit, baseSha]);
    return { kind: 'merged', sha: commit };
  }

  async commitsSince(branch: string, sinceSha: string | null): Promise<readonly LocalCommit[]> {
    const ref = await this.resolveHistoryRef(branch);
    if (sinceSha === null) {
      return parseCommits(await this.git.run(this.path, ['log', '--first-parent', '--reverse', `--max-count=${RECENT_COMMIT_LIMIT}`, LOG_FORMAT, ref]));
    }
    if (!(await this.isAncestor(sinceSha, ref))) throw new UnknownCommitError(branch, sinceSha);
    return parseCommits(await this.git.run(this.path, ['log', '--first-parent', '--reverse', LOG_FORMAT, `${sinceSha}..${ref}`]));
  }

  async commit(ref: string): Promise<LocalCommit> {
    const resolved = await this.git.runResult(this.path, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    const [found] = resolved.exitCode === 0 ? parseCommits(await this.git.run(this.path, ['log', '--max-count=1', LOG_FORMAT, resolved.stdout.trim()])) : [];
    if (found === undefined) throw new UnknownCommitError(this.path, ref);
    return found;
  }

  async tags(): Promise<readonly LocalTag[]> {
    const output = await this.git.run(this.path, ['for-each-ref', TAG_LIST_FORMAT, TAG_REF_PREFIX]);
    return output
      .split(NEWLINE)
      .filter((line) => line !== '')
      .map((line) => {
        const [name = '', objectSha = '', peeledSha = ''] = line.split(NUL);
        return { name, sha: peeledSha === '' ? objectSha : peeledSha };
      });
  }

  async commitDiff(sha: string): Promise<CommitDiff> {
    const common = ['show', '--format=', '--diff-merges=first-parent', '--no-color', '--no-ext-diff'];
    const diff = await this.git.run(this.path, [...common, '--patch', sha]);
    const names = await this.git.run(this.path, [...common, '--name-only', '-z', sha]);
    return { diff, changedFiles: names.split(NUL).filter((name) => name !== '') };
  }

  private async resolveHistoryRef(name: string): Promise<string> {
    const branchRef = `${BRANCH_REF_PREFIX}${name}`;
    if ((await this.branchHead(name)) !== null) return branchRef;
    const tagRef = `${TAG_REF_PREFIX}${name}`;
    const tagResult = await this.git.runResult(this.path, ['rev-parse', '--verify', '--quiet', `${tagRef}^{commit}`]);
    return tagResult.exitCode === 0 ? tagRef : branchRef;
  }

  private async isAncestor(commit: string, ref: string): Promise<boolean> {
    const result = await this.git.runResult(this.path, ['merge-base', '--is-ancestor', commit, ref]);
    return result.exitCode === 0;
  }

  private async assertMergeTreeSupported(): Promise<void> {
    if (this.versionChecked) return;
    const version = await this.git.run(this.path, ['--version']);
    const match = GIT_VERSION_PATTERN.exec(version);
    const [requiredMajor, requiredMinor] = MERGE_TREE_MINIMUM_GIT_VERSION;
    const major = Number(match?.[1] ?? 0);
    const minor = Number(match?.[2] ?? 0);
    if (major < requiredMajor || (major === requiredMajor && minor < requiredMinor)) {
      throw new GitTooOldError(version, MERGE_TREE_MINIMUM_GIT_VERSION);
    }
    this.versionChecked = true;
  }
}
