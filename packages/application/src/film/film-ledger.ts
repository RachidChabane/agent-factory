import { forecastFilmArrivals, ISSUE_SUBJECT_PREFIX, typicalFilmDurationMs, type FilmForecastEntry, type FilmSlot } from '@agent-factory/domain';
import { issueJournalsOf } from '../daemon/held-worktrees.ts';
import { ProjectEventStore } from '../projects/project-event-store.ts';
import { FilmFailedSchema, FilmFinishedSchema, FilmStartedSchema, PIPELINE_EVENTS } from '../pipeline/journal-events.ts';
import { isFilmPending, type FilmOrderState, type PipelineJournal } from '../pipeline/pipeline-journal.ts';
import type { Clock, EventStore, FactoryEventRecord } from '../ports.ts';
import { isQueueable, unorderedDeclaredFilms } from './film-pending.ts';

const FIRST_SEQUENCE = 0;
const KEY_SEPARATOR = '/';

/** The issue records of a project's view of the log. */
export function readIssueRecords(events: EventStore): Promise<readonly FactoryEventRecord[]> {
  return events.read(ISSUE_SUBJECT_PREFIX, FIRST_SEQUENCE);
}

/** A project that films, with its view of the installation's log. */
export interface FilmProjectLog {
  readonly projectId: string;
  readonly events: EventStore;
}

/** What one project's log says about its issues. */
export interface FilmProjectState {
  readonly projectId: string;
  readonly records: readonly FactoryEventRecord[];
  readonly journals: ReadonlyMap<number, PipelineJournal>;
}

/** What a project's records say of its issues, whichever way they were read. */
export function filmProjectState(projectId: string, records: readonly FactoryEventRecord[]): FilmProjectState {
  return { projectId, records, journals: issueJournalsOf(records) };
}

export function filmKey(projectId: string, issueNumber: number, scenario: string): string {
  return [projectId, issueNumber, scenario].join(KEY_SEPARATOR);
}

export interface FilmDuration {
  readonly finishedSequence: number;
  readonly durationMs: number;
}

/** How long each film that finished took, from its start to its end. A failed film leaves no duration. */
export function filmDurations(records: readonly FactoryEventRecord[]): readonly FilmDuration[] {
  const startedAt = new Map<string, number>();
  const durations: FilmDuration[] = [];
  const keyOf = (record: FactoryEventRecord, scenario: string): string => `${record.subject}${KEY_SEPARATOR}${scenario}`;
  for (const record of records) {
    if (record.type === PIPELINE_EVENTS.filmStarted) {
      const started = FilmStartedSchema.safeParse(record.payload);
      if (started.success) startedAt.set(keyOf(record, started.data.scenario), record.occurredAt.getTime());
    } else if (record.type === PIPELINE_EVENTS.filmFinished) {
      const finished = FilmFinishedSchema.safeParse(record.payload);
      const key = finished.success ? keyOf(record, finished.data.scenario) : null;
      const began = key === null ? undefined : startedAt.get(key);
      if (key !== null && began !== undefined) {
        durations.push({ finishedSequence: record.sequence, durationMs: record.occurredAt.getTime() - began });
        startedAt.delete(key);
      }
    } else if (record.type === PIPELINE_EVENTS.filmFailed) {
      const failed = FilmFailedSchema.safeParse(record.payload);
      if (failed.success) startedAt.delete(keyOf(record, failed.data.scenario));
    }
  }
  return durations;
}

interface PendingFilm {
  readonly key: string;
  readonly order: FilmOrderState;
}

function pendingFilms(world: readonly FilmProjectState[]): readonly PendingFilm[] {
  return world.flatMap((project) =>
    [...project.journals.values()].flatMap((journal) =>
      journal.filmOrders
        .filter((order) => isFilmPending(order) && (order.status === 'running' || isQueueable(journal)))
        .map((order) => ({ key: filmKey(project.projectId, journal.issueNumber, order.scenario), order })),
    ),
  );
}

/** The running film, then the queued ones in the order the log queued them, whichever project they belong to. */
function queuedSlots(world: readonly FilmProjectState[]): readonly FilmSlot[] {
  const pending = pendingFilms(world);
  const running = pending.filter(({ order }) => order.status === 'running');
  const waiting = pending.filter(({ order }) => order.status === 'queued').toSorted((left, right) => left.order.queuedSequence - right.order.queuedSequence);
  return [
    ...running.map(({ key, order }) => ({ key, startedAtMs: Date.parse(order.startedAt ?? order.queuedAt) })),
    ...waiting.map(({ key }) => ({ key, startedAtMs: null })),
  ];
}

/** The declared films nobody ordered yet, as the next tick will order them: by project, then by issue. */
function declaredSlots(world: readonly FilmProjectState[]): readonly FilmSlot[] {
  return world.flatMap((project) =>
    [...project.journals.values()]
      .toSorted((left, right) => left.issueNumber - right.issueNumber)
      .flatMap((journal) => unorderedDeclaredFilms(journal).map((scenario) => ({ key: filmKey(project.projectId, journal.issueNumber, scenario), startedAtMs: null }))),
  );
}

/** When each film of the installation's queue is expected to end. */
export class FilmForecast {
  private readonly entries: ReadonlyMap<string, FilmForecastEntry>;
  readonly typicalDurationMs: number;

  constructor(entries: ReadonlyMap<string, FilmForecastEntry>, typicalDurationMs: number) {
    this.entries = entries;
    this.typicalDurationMs = typicalDurationMs;
  }

  of(projectId: string, issueNumber: number, scenario: string): FilmForecastEntry | null {
    return this.entries.get(filmKey(projectId, issueNumber, scenario)) ?? null;
  }

  /** The last of the scenarios to arrive: when the pull request has all its films. */
  latestOf(projectId: string, issueNumber: number, scenarios: readonly string[]): FilmForecastEntry | null {
    const arrivals = scenarios.flatMap((scenario) => this.of(projectId, issueNumber, scenario) ?? []);
    return arrivals.toSorted((left, right) => right.arrivalAtMs - left.arrivalAtMs)[0] ?? null;
  }
}

/**
 * The films of every project that films, read from the installation's log. Films wait in one
 * queue across projects, so an expected arrival counts the films of all of them.
 */
export class FilmLedger {
  private readonly projects: readonly FilmProjectLog[];
  private readonly clock: Clock;
  private readonly fallbackDurationMs: number;

  /** `fallbackDurationMs` stands for a film while no film has succeeded yet. */
  constructor(projects: readonly FilmProjectLog[], clock: Clock, fallbackDurationMs: number) {
    this.projects = projects;
    this.clock = clock;
    this.fallbackDurationMs = fallbackDurationMs;
  }

  /** The ledger of the projects named, each seen through its own view of the installation's log. */
  static ofInstallation(events: EventStore, projectIds: readonly string[], clock: Clock, fallbackDurationMs: number): FilmLedger {
    return new FilmLedger(projectIds.map((projectId) => ({ projectId, events: new ProjectEventStore(events, projectId) })), clock, fallbackDurationMs);
  }

  async read(): Promise<readonly FilmProjectState[]> {
    return Promise.all(this.projects.map(async ({ projectId, events }) => filmProjectState(projectId, await readIssueRecords(events))));
  }

  /** The forecast from records already read, one list per project, each with the subjects the project sees. */
  forecastFrom(recordsByProject: ReadonlyMap<string, readonly FactoryEventRecord[]>): FilmForecast {
    return this.forecastOf(this.projects.map(({ projectId }) => filmProjectState(projectId, recordsByProject.get(projectId) ?? [])));
  }

  forecastOf(world: readonly FilmProjectState[]): FilmForecast {
    const durations = world
      .flatMap((project) => filmDurations(project.records))
      .toSorted((left, right) => left.finishedSequence - right.finishedSequence)
      .map((duration) => duration.durationMs);
    const typical = typicalFilmDurationMs(durations, this.fallbackDurationMs);
    return new FilmForecast(forecastFilmArrivals([...queuedSlots(world), ...declaredSlots(world)], typical, this.clock.now().getTime()), typical);
  }

  async forecast(): Promise<FilmForecast> {
    return this.forecastOf(await this.read());
  }
}
