import { FILM_SCENARIO_RULE, isFilmScenarioName } from '@agent-factory/domain';
import { issueJournalsOf } from '../daemon/held-worktrees.ts';
import { FACTORY_FILM_OPERATOR, PIPELINE_EVENTS } from '../pipeline/journal-events.ts';
import { IssueJournalWriter } from '../pipeline/journal-writer.ts';
import type { PipelineDependencies } from '../pipeline/pipeline-dependencies.ts';
import { isFilmPending, loadJournal, type PipelineJournal } from '../pipeline/pipeline-journal.ts';
import type { FilmBodies } from './film-bodies.ts';
import { FilmRefusedError } from './film-errors.ts';
import { readIssueRecords } from './film-ledger.ts';
import type { FilmOrder, QueuedFilm } from './film-order.ts';
import { awaitingMergeRefusal, isQueueable, requireFilmSubject, unorderedDeclaredFilms } from './film-pending.ts';

export type FilmQueueDependencies = Pick<PipelineDependencies, 'events' | 'states'>;

/** The film orders of one project, kept in its log; the installation's queue picks among the projects'. */
export class FilmQueue {
  private readonly dependencies: FilmQueueDependencies;
  private readonly bodies: FilmBodies;

  constructor(dependencies: FilmQueueDependencies, bodies: FilmBodies) {
    this.dependencies = dependencies;
    this.bodies = bodies;
  }

  /** Orders a scenario by hand; one already queued or recording is not queued twice. */
  async order(order: FilmOrder): Promise<void> {
    if (!isFilmScenarioName(order.scenario)) {
      throw new FilmRefusedError(order.issueNumber, `the scenario name must be ${FILM_SCENARIO_RULE}`);
    }
    const journal = await loadJournal(this.dependencies.events, order.issueNumber);
    requireFilmSubject(journal);
    const pending = journal.filmOrders.find((candidate) => candidate.scenario === order.scenario && isFilmPending(candidate));
    if (pending !== undefined) throw new FilmRefusedError(order.issueNumber, `the film of scenario ${order.scenario} is already ${pending.status}`);
    await this.record(order);
    await this.bodies.refreshAll();
  }

  /** Queues a film about to start when the journal holds no pending order for its scenario yet. */
  async ensureQueued(order: FilmOrder, journal: PipelineJournal): Promise<void> {
    if (journal.filmOrders.some((candidate) => candidate.scenario === order.scenario && isFilmPending(candidate))) return;
    await this.record(order);
  }

  /** Orders every scenario a spec declares and nobody ordered, once its pull request is open. */
  async orderDeclared(): Promise<readonly FilmOrder[]> {
    const journals = [...issueJournalsOf(await readIssueRecords(this.dependencies.events)).values()].toSorted((left, right) => left.issueNumber - right.issueNumber);
    const orders = journals
      .filter((journal) => awaitingMergeRefusal(journal) === null)
      .flatMap((journal) =>
        unorderedDeclaredFilms(journal).map((scenario): FilmOrder => ({ issueNumber: journal.issueNumber, scenario, operator: FACTORY_FILM_OPERATOR })),
      );
    for (const order of orders) await this.record(order);
    if (orders.length > 0) await this.bodies.refreshAll();
    return orders;
  }

  /** The film of this project that was ordered first and has not started. */
  async next(): Promise<QueuedFilm | null> {
    const queued = [...issueJournalsOf(await readIssueRecords(this.dependencies.events)).values()]
      .filter(isQueueable)
      .flatMap((journal) =>
        journal.filmOrders
          .filter((order) => order.status === 'queued')
          .map((order): QueuedFilm => ({ order: { issueNumber: journal.issueNumber, scenario: order.scenario, operator: order.operator }, queuedSequence: order.queuedSequence })),
      )
      .toSorted((left, right) => left.queuedSequence - right.queuedSequence);
    return queued[0] ?? null;
  }

  async fail(order: FilmOrder, reason: string): Promise<void> {
    await new IssueJournalWriter(this.dependencies.events, this.dependencies.states, order.issueNumber).record(PIPELINE_EVENTS.filmFailed, {
      scenario: order.scenario,
      reason,
    });
    await this.bodies.refreshAll();
  }

  private async record(order: FilmOrder): Promise<void> {
    await new IssueJournalWriter(this.dependencies.events, this.dependencies.states, order.issueNumber).record(PIPELINE_EVENTS.filmQueued, {
      scenario: order.scenario,
      operator: order.operator,
    });
  }
}
