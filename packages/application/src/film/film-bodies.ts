import { OutboundSecretScan } from '../pipeline/outbound-secret-scan.ts';
import type { PipelineDependencies } from '../pipeline/pipeline-dependencies.ts';
import { projectJournal, type PipelineJournal } from '../pipeline/pipeline-journal.ts';
import type { ForgeFileLinks } from '../pipeline/pipeline-settings.ts';
import { issueJournalsOf } from '../daemon/held-worktrees.ts';
import type { FilmForecast, FilmLedger } from './film-ledger.ts';
import { readIssueRecords } from './film-ledger.ts';
import { isFilmable } from './film-pending.ts';
import { composeFilmSection } from './film-section-composer.ts';
import { replaceFilmSection } from './film-section.ts';
import type { FilmPresentation } from './film-settings.ts';

export type FilmBodiesDependencies = Pick<PipelineDependencies, 'github' | 'events' | 'knownSecrets'>;

/** What a project's film bodies need to know about the project. */
export interface FilmBodiesContext {
  readonly projectId: string;
  readonly fileLinks: ForgeFileLinks;
  readonly presentation: FilmPresentation;
}

export interface FilmBodyRefreshFailure {
  readonly issueNumber: number;
  readonly reason: string;
}

export interface FilmBodyRefresh {
  readonly updated: readonly number[];
  readonly failed: readonly FilmBodyRefreshFailure[];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Keeps the `Behaviour on video` section of the pull request bodies of a project in line with the films of the installation. */
export class FilmBodies {
  private readonly dependencies: FilmBodiesDependencies;
  private readonly context: FilmBodiesContext;
  private readonly ledger: FilmLedger;

  constructor(dependencies: FilmBodiesDependencies, context: FilmBodiesContext, ledger: FilmLedger) {
    this.dependencies = dependencies;
    this.context = context;
    this.ledger = ledger;
  }

  /** The section a pull request body carries now, or null when no film concerns the pull request. */
  async sectionFor(journal: PipelineJournal): Promise<string | null> {
    return this.compose(journal, await this.ledger.forecast());
  }

  async refresh(issueNumber: number): Promise<boolean> {
    const records = await readIssueRecords(this.dependencies.events);
    return this.refreshFrom(projectJournal(issueNumber, records), await this.ledger.forecast());
  }

  async refreshAll(): Promise<FilmBodyRefresh> {
    const journals = issueJournalsOf(await readIssueRecords(this.dependencies.events));
    const forecast = await this.ledger.forecast();
    const updated: number[] = [];
    const failed: FilmBodyRefreshFailure[] = [];
    for (const journal of journals.values()) {
      try {
        if (await this.refreshFrom(journal, forecast)) updated.push(journal.issueNumber);
      } catch (error) {
        failed.push({ issueNumber: journal.issueNumber, reason: describe(error) });
      }
    }
    return { updated, failed };
  }

  private compose(journal: PipelineJournal, forecast: FilmForecast): string | null {
    const { projectId, fileLinks, presentation } = this.context;
    return composeFilmSection(journal, { projectId, fileLinks, presentation, forecast });
  }

  private async refreshFrom(journal: PipelineJournal, forecast: FilmForecast): Promise<boolean> {
    const pullRequest = journal.pullRequest;
    if (pullRequest === null || !isFilmable(journal) || journal.evidenceRemoval !== null) return false;
    const section = this.compose(journal, forecast);
    if (section === null) return false;
    const { github, knownSecrets } = this.dependencies;
    const details = await github.pullRequestDetails(pullRequest.number);
    const body = replaceFilmSection(details.body, section);
    if (body === details.body) return false;
    await new OutboundSecretScan(knownSecrets).assertClean({ body }, `update the body of pull request #${pullRequest.number}`);
    await github.updatePullRequestBody(pullRequest.number, body);
    return true;
  }
}
