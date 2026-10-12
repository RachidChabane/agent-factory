import type { RepositoryCommit } from '@agent-factory/adapters';
import { currentDeployment, deploymentRanges, type DeploymentRecord } from '@agent-factory/application';

/** The commits of a range; null when the clone cannot say, which is not the same as no commit at all. */
export type Commits = readonly RepositoryCommit[] | null;

/** What the project's clone says about its history. */
export interface ClonedHistory {
  commitsBetween(baseSha: string, headSha: string): Promise<Commits>;
  baseHead(): Promise<string | null>;
}

/**
 * The commits each deployment of an environment brought, and those that wait behind the current one, read from the
 * clone. A range between two shas never changes, so one that the clone answered is kept for good.
 */
export class DeploymentCommits {
  private readonly history: ClonedHistory;
  private readonly known = new Map<string, readonly RepositoryCommit[]>();

  constructor(history: ClonedHistory) {
    this.history = history;
  }

  /** The commits of each deployment, by deployment id, from the deployments of an environment newest first. */
  async changes(newestFirst: readonly DeploymentRecord[]): Promise<ReadonlyMap<string, Commits>> {
    const entries = await Promise.all(
      [...deploymentRanges(newestFirst)].map(async ([id, range]) => [id, await this.between(range.baseSha, range.headSha)] as const),
    );
    return new Map(entries);
  }

  /** The commits of the base branch that the current deployment lacks; null when nothing is deployed. */
  async pending(newestFirst: readonly DeploymentRecord[]): Promise<Commits> {
    const current = currentDeployment(newestFirst);
    if (current === null) return null;
    return this.between(current.sha, await this.history.baseHead());
  }

  private async between(baseSha: string | null, headSha: string | null): Promise<Commits> {
    if (baseSha === null || headSha === null) return null;
    if (baseSha === headSha) return [];
    const key = `${baseSha}..${headSha}`;
    const known = this.known.get(key);
    if (known !== undefined) return known;
    const commits = await this.history.commitsBetween(baseSha, headSha).catch((): Commits => null);
    if (commits !== null) this.known.set(key, commits);
    return commits;
  }
}
