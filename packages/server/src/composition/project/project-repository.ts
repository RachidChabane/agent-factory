import type { GitObjects, RepositoryCommit } from '@agent-factory/adapters';
import { issueOfPullRequest, loadJournal, PullRequestNotFromFactoryError, type Clock, type EventStore } from '@agent-factory/application';
import type { PullRequestDiff } from '@agent-factory/cockpit';

/** Reads the commits of a project's repository from the factory's clone: a commit's files, and what a pull request changes. */
export class ProjectRepository {
  private readonly objects: GitObjects;
  private readonly events: EventStore;
  private readonly clock: Clock;
  private readonly baseRefs: readonly string[];

  /** `baseRefs` name the base branch in the clone, the one the clone fetched first: the head of the first that exists is the base head. */
  constructor(objects: GitObjects, events: EventStore, clock: Clock, baseRefs: readonly string[]) {
    this.objects = objects;
    this.events = events;
    this.clock = clock;
    this.baseRefs = baseRefs;
  }

  file(sha: string, path: string): Promise<Uint8Array | null> {
    return this.objects.file(sha, path);
  }

  /** The commits that `headSha` has and `baseSha` does not; null when the clone holds neither. */
  commitsBetween(baseSha: string, headSha: string): Promise<readonly RepositoryCommit[] | null> {
    return this.objects.commitsBetween(baseSha, headSha);
  }

  /** The head of the base branch as the clone last fetched it; null when the clone has no such branch. */
  async baseHead(): Promise<string | null> {
    for (const ref of this.baseRefs) {
      const sha = await this.objects.resolve(ref);
      if (sha !== null) return sha;
    }
    return null;
  }

  /** The change of a pull request of the factory, from its issue's base to the implementation it proves; null for any other number. */
  async pullRequestDiff(pullRequestNumber: number): Promise<PullRequestDiff | null> {
    const issueNumber = await issueOfPullRequest(this.events, pullRequestNumber).catch((error: unknown) => {
      if (error instanceof PullRequestNotFromFactoryError) return null;
      throw error;
    });
    if (issueNumber === null) return null;
    const journal = await loadJournal(this.events, issueNumber);
    const head = journal.implementationCommit ?? journal.pushedHead;
    if (journal.baseSha === null || head === null) return null;
    const files = await this.objects.diff(journal.baseSha, head);
    return { pullRequestNumber, baseSha: journal.baseSha, headSha: head, readAt: this.clock.now().toISOString(), files: files.map((file) => ({ ...file })) };
  }
}
