import { evaluatePullRequestReadiness } from '@agent-factory/domain';
import { issueJournalsOf } from '../daemon/held-worktrees.ts';
import { readIssueRecords } from '../film/film-ledger.ts';
import { failedFilmScenarios, pendingFilmScenarios } from '../film/film-pending.ts';
import { NOTICES, type OperatorNotifications } from '../notifications/operator-notifications.ts';
import { PIPELINE_EVENTS, type PullRequestReadyAnnouncedRecord } from '../pipeline/journal-events.ts';
import { IssueJournalWriter } from '../pipeline/journal-writer.ts';
import { currentHeadOf, isAnnouncedReady, type PipelineJournal } from '../pipeline/pipeline-journal.ts';
import type { Clock, EventStore, GitHubGateway, IssueStateStore, OperationLog } from '../ports.ts';
import { isAwaitingMerge } from './awaiting-merge.ts';
import { readinessChecksOf } from './ready-checks.ts';
import { readyMediaOf } from './ready-media.ts';
import { NO_PUBLISHED_MEDIA, type MediaPublisher, type PublishedMedia } from './media-publisher.ts';

const KEY_SEPARATOR = '@';

export interface PullRequestReadyDependencies {
  readonly events: EventStore;
  readonly states: IssueStateStore;
  readonly github: GitHubGateway;
  readonly clock: Clock;
  readonly log: OperationLog;
  readonly notifications: OperatorNotifications;
  /** Uploads media with the operator's command, stopping with the signal; null when the project declares no upload command. */
  readonly publisher: (signal: AbortSignal) => MediaPublisher | null;
}

export interface PullRequestReadySettings {
  /** Where the factory keeps its copies of the films and evidence images of each issue. */
  readonly evidenceCacheDirectory: string;
  /** Whether the project films: a film its specs declare only holds a pull request when it can be recorded. */
  readonly filming: boolean;
  /** How long a forge that reports no check may take to register one before the empty list counts as passed. */
  readonly checksSettleMs: number;
  /** How long to wait before sending a notice again that no channel took. */
  readonly deliveryRetryMs: number;
}

export interface PullRequestReadyScanner {
  /** Announces each pull request that became ready for the head it has now; says which. */
  scan(signal: AbortSignal): Promise<readonly PullRequestReadyAnnouncedRecord[]>;
}

interface Candidate {
  readonly journal: PipelineJournal;
  readonly headSha: string;
  readonly pendingFilms: readonly string[];
  readonly failedFilms: readonly string[];
}

function keyOf(issueNumber: number, headSha: string): string {
  return `${issueNumber}${KEY_SEPARATOR}${headSha}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Tells the operator once per head that a pull request is ready to merge, with links to its films and images.
 * A pull request is ready when every check reported on its head completed without failing and none of its films is queued,
 * recording or failed.
 */
export class PullRequestReadyWatch implements PullRequestReadyScanner {
  private readonly dependencies: PullRequestReadyDependencies;
  private readonly settings: PullRequestReadySettings;
  private readonly firstSeenWithoutChecks = new Map<string, number>();
  private readonly retryNotBefore = new Map<string, number>();
  private readonly published = new Map<string, PublishedMedia>();

  constructor(dependencies: PullRequestReadyDependencies, settings: PullRequestReadySettings) {
    this.dependencies = dependencies;
    this.settings = settings;
  }

  async scan(signal: AbortSignal): Promise<readonly PullRequestReadyAnnouncedRecord[]> {
    const announced: PullRequestReadyAnnouncedRecord[] = [];
    const journals = [...issueJournalsOf(await readIssueRecords(this.dependencies.events)).values()].toSorted((left, right) => left.issueNumber - right.issueNumber);
    this.forgetAllBut(journals);
    for (const journal of journals) {
      const candidate = this.candidateOf(journal);
      if (candidate === null || signal.aborted) continue;
      try {
        const record = await this.announceIfReady(candidate, signal);
        if (record !== null) announced.push(record);
      } catch (error) {
        this.holdOff(candidate);
        this.dependencies.log.warn(`the ready notice of issue #${journal.issueNumber} was not sent: ${errorText(error)}`);
      }
    }
    return announced;
  }

  private candidateOf(journal: PipelineJournal): Candidate | null {
    const headSha = currentHeadOf(journal);
    if (headSha === null || !isAwaitingMerge(journal) || isAnnouncedReady(journal, headSha) || this.isHeldOff(journal.issueNumber, headSha)) return null;
    const films = this.settings.filming;
    return { journal, headSha, pendingFilms: films ? pendingFilmScenarios(journal) : [], failedFilms: films ? failedFilmScenarios(journal) : [] };
  }

  private async announceIfReady(candidate: Candidate, signal: AbortSignal): Promise<PullRequestReadyAnnouncedRecord | null> {
    const { journal, headSha } = candidate;
    const checks = readinessChecksOf(await this.dependencies.github.checks(headSha), this.settledWithoutChecks(journal.issueNumber, headSha));
    const readiness = evaluatePullRequestReadiness({ ...checks, pendingFilms: candidate.pendingFilms, failedFilms: candidate.failedFilms });
    if (!readiness.ready || !(await this.headIsLive(journal, headSha))) return null;
    return this.announce(candidate, signal);
  }

  private settledWithoutChecks(issueNumber: number, headSha: string): boolean {
    const key = keyOf(issueNumber, headSha);
    const now = this.dependencies.clock.now().getTime();
    const firstSeen = this.firstSeenWithoutChecks.get(key) ?? now;
    this.firstSeenWithoutChecks.set(key, firstSeen);
    return now - firstSeen >= this.settings.checksSettleMs;
  }

  private async headIsLive(journal: PipelineJournal, headSha: string): Promise<boolean> {
    if (journal.branch === null) return false;
    return (await this.dependencies.github.findOpenPullRequest(journal.branch))?.headSha === headSha;
  }

  private async announce(candidate: Candidate, signal: AbortSignal): Promise<PullRequestReadyAnnouncedRecord | null> {
    const { journal, headSha } = candidate;
    const pullRequest = journal.pullRequest;
    if (pullRequest === null) return null;
    const media = await this.mediaOf(candidate, signal);
    if (media === null) return null;
    const details = await this.dependencies.github.pullRequestDetails(pullRequest.number);
    const films = journal.films.map((film) => film.scenario);
    const delivered = await this.dependencies.notifications.send(NOTICES.pullRequestReady({ issueNumber: journal.issueNumber, pullRequest, title: details.title, films, media: media.links }));
    if (!delivered) {
      this.holdOff(candidate);
      return null;
    }
    const record: PullRequestReadyAnnouncedRecord = { pullRequestNumber: pullRequest.number, headSha, links: [...media.links], failures: [...media.failures] };
    await new IssueJournalWriter(this.dependencies.events, this.dependencies.states, journal.issueNumber).record(PIPELINE_EVENTS.pullRequestReadyAnnounced, record);
    this.forget(journal.issueNumber, headSha);
    return record;
  }

  /** The links of the head's media: uploaded at most once per head, even when the notice has to be sent again. Null when the factory is stopping. */
  private async mediaOf({ journal, headSha }: Candidate, signal: AbortSignal): Promise<PublishedMedia | null> {
    const key = keyOf(journal.issueNumber, headSha);
    const known = this.published.get(key);
    if (known !== undefined) return known;
    const publisher = this.dependencies.publisher(signal);
    const published = publisher === null ? NO_PUBLISHED_MEDIA : await publisher.publish(readyMediaOf(journal, this.settings.evidenceCacheDirectory), signal);
    if (signal.aborted) return null;
    this.published.set(key, published);
    return published;
  }

  private isHeldOff(issueNumber: number, headSha: string): boolean {
    const notBefore = this.retryNotBefore.get(keyOf(issueNumber, headSha));
    return notBefore !== undefined && this.dependencies.clock.now().getTime() < notBefore;
  }

  private holdOff({ journal, headSha }: Candidate): void {
    this.retryNotBefore.set(keyOf(journal.issueNumber, headSha), this.dependencies.clock.now().getTime() + this.settings.deliveryRetryMs);
  }

  private forget(issueNumber: number, headSha: string): void {
    const key = keyOf(issueNumber, headSha);
    this.retryNotBefore.delete(key);
    this.firstSeenWithoutChecks.delete(key);
    this.published.delete(key);
  }

  /** Drops what was kept for heads that are no longer the head of a pull request awaiting its merge. */
  private forgetAllBut(journals: readonly PipelineJournal[]): void {
    const live = new Set(journals.flatMap((journal) => (isAwaitingMerge(journal) && currentHeadOf(journal) !== null ? [keyOf(journal.issueNumber, currentHeadOf(journal) ?? '')] : [])));
    for (const kept of [this.retryNotBefore, this.firstSeenWithoutChecks, this.published]) {
      for (const key of [...kept.keys()]) if (!live.has(key)) kept.delete(key);
    }
  }
}
