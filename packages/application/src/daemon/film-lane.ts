import { FilmDeferredError, FilmRefusedError, type FilmDeferralKind } from '../film/film-errors.ts';
import type { FilmOrder, QueuedFilm } from '../film/film-order.ts';
import type { FilmRunner } from '../film/film-runner.ts';
import { NOTICES, type OperatorNotifications } from '../notifications/operator-notifications.ts';
import type { OperationLog } from '../ports.ts';
import { SLOTS_FREE, SLOTS_HELD, type SchedulingHold } from './scheduling-hold.ts';
import type { PauseSet } from './scheduling-pauses.ts';
import type { PauseCause } from '@agent-factory/domain';

/**
 * The pauses under which films go on: the subscription budget only pays for the agents, and the
 * film command spends none of it. A pause of the operator, a drain or short resources hold them.
 */
export const FILM_TOLERATED_PAUSES: readonly PauseCause[] = ['budget'];

/** What the lane knows about a project that films. */
export interface FilmLaneProject {
  readonly projectId: string;
  readonly films: FilmRunner;
  readonly notifications: OperatorNotifications;
  readonly log: OperationLog;
  /** The pauses recorded for this project alone; the installation's are given at each tick. */
  pauses(): Promise<PauseSet>;
}

export interface FilmTick {
  /** The pauses of the whole installation at this tick. */
  readonly pauses: PauseSet;
  /** Whether an issue, a challenge or an audit of any project is running. */
  readonly workRunning: boolean;
}

/** What the installation's daemon asks of the films: decide at each tick, and say when one is recording. */
export interface InstallationFilms {
  isRecording(): boolean;
  /** Decides what the films do at this tick and whether they hold the slots of every project. */
  tick(input: FilmTick, signal: AbortSignal): Promise<SchedulingHold>;
  /** Settles once the film recording now, if any, has ended. */
  settle(): Promise<void>;
}

interface WaitingFilm {
  readonly project: FilmLaneProject;
  readonly queued: QueuedFilm;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toleratesFilms(pauses: PauseSet): boolean {
  return [...pauses.keys()].every((cause) => FILM_TOLERATED_PAUSES.includes(cause));
}

/**
 * The one queue of films of the installation. A film starts when nothing else runs, in any
 * project, and while it records it holds every slot. The film ordered first goes first,
 * whichever project it belongs to; a project the operator paused keeps its films waiting.
 */
export class FilmLane implements InstallationFilms {
  private readonly projects: readonly FilmLaneProject[];
  private recording: Promise<void> | null = null;
  /** Why the first film of the queue could not start at the last tick; null while it waits for running work. */
  private deferral: FilmDeferralKind | null = null;

  constructor(projects: readonly FilmLaneProject[]) {
    this.projects = projects;
  }

  isRecording(): boolean {
    return this.recording !== null;
  }

  async settle(): Promise<void> {
    await this.recording;
  }

  async tick({ pauses, workRunning }: FilmTick, signal: AbortSignal): Promise<SchedulingHold> {
    if (this.recording !== null) return SLOTS_HELD;
    if (signal.aborted || !toleratesFilms(pauses)) return this.release();
    const eligible = await this.eligibleProjects();
    await this.orderDeclared(eligible);
    const waiting = await this.oldestQueued(eligible);
    if (waiting === null) return this.release();
    if (workRunning) {
      this.deferral = null;
      return SLOTS_HELD;
    }
    return this.start(waiting, signal);
  }

  private release(): SchedulingHold {
    this.deferral = null;
    return SLOTS_FREE;
  }

  private async eligibleProjects(): Promise<readonly FilmLaneProject[]> {
    const eligible: FilmLaneProject[] = [];
    for (const project of this.projects) {
      if (toleratesFilms(await project.pauses())) eligible.push(project);
    }
    return eligible;
  }

  private async orderDeclared(eligible: readonly FilmLaneProject[]): Promise<void> {
    let ordered = 0;
    for (const { films, log } of eligible) {
      const orders = await films.orderDeclared();
      for (const order of orders) log.info(`film of scenario ${order.scenario} queued for issue #${order.issueNumber}`);
      ordered += orders.length;
    }
    if (ordered > 0) await this.refreshBodies();
  }

  private async oldestQueued(eligible: readonly FilmLaneProject[]): Promise<WaitingFilm | null> {
    const waiting: WaitingFilm[] = [];
    for (const project of eligible) {
      const queued = await project.films.next();
      if (queued !== null) waiting.push({ project, queued });
    }
    return waiting.toSorted((left, right) => left.queued.queuedSequence - right.queued.queuedSequence)[0] ?? null;
  }

  private async start({ project, queued }: WaitingFilm, signal: AbortSignal): Promise<SchedulingHold> {
    const { order } = queued;
    try {
      await project.films.prepare(order);
    } catch (error) {
      if (error instanceof FilmDeferredError) {
        this.deferral = error.kind;
        project.log.info(`film of scenario ${order.scenario} for issue #${order.issueNumber} waits: ${error.reason}`);
        return error.kind === 'resources' ? SLOTS_FREE : SLOTS_HELD;
      }
      if (!(error instanceof FilmRefusedError)) throw error;
      await project.films.fail(order, error.reason);
      await project.notifications.send(NOTICES.filmFailed(order.issueNumber, order.scenario, error.reason));
      return this.release();
    }
    this.deferral = null;
    this.recording = this.record(project, order, signal).finally(() => {
      this.recording = null;
    });
    return SLOTS_HELD;
  }

  private async record(project: FilmLaneProject, order: FilmOrder, signal: AbortSignal): Promise<void> {
    const { films, notifications, log } = project;
    try {
      const outcome = await films.film(order, signal);
      await notifications.send(
        outcome.kind === 'finished'
          ? NOTICES.filmFinished(outcome.issueNumber, outcome.pullRequestNumber, outcome.scenario)
          : NOTICES.filmFailed(outcome.issueNumber, outcome.scenario, outcome.reason),
      );
    } catch (error) {
      log.warn(`film of issue #${order.issueNumber} failed: ${message(error)}`);
      await notifications.send(NOTICES.filmFailed(order.issueNumber, order.scenario, message(error)));
    }
    await this.refreshBodies();
  }

  /** The films of every project stand in one queue: each film that starts or ends moves the placeholders of the others. */
  private async refreshBodies(): Promise<void> {
    for (const { films, log } of this.projects) {
      try {
        const refresh = await films.refreshBodies();
        for (const failure of refresh.failed) log.warn(`the film placeholder of issue #${failure.issueNumber} could not be refreshed: ${failure.reason}`);
      } catch (error) {
        log.warn(`the film placeholders could not be refreshed: ${message(error)}`);
      }
    }
  }
}
