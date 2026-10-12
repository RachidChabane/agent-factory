import type { GitObjects } from '@agent-factory/adapters';
import { issueOfPullRequest, loadJournal, PullRequestNotFromFactoryError, type Clock, type EventStore } from '@agent-factory/application';
import type { PullRequestDiff } from '@agent-factory/cockpit';

/** Reads the commits of a project's repository from the factory's clone: a commit's files, and what a pull request changes. */
export class ProjectRepository {
  private readonly objects: GitObjects;
  private readonly events: EventStore;
  private readonly clock: Clock;

  constructor(objects: GitObjects, events: EventStore, clock: Clock) {
    this.objects = objects;
    this.events = events;
    this.clock = clock;
  }

  file(sha: string, path: string): Promise<Uint8Array | null> {
    return this.objects.file(sha, path);
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
