import { decideFilmStart, type FilmStartDecision, type FilmToolBlock, type PauseCause, type QueuedFilmNeed } from '@agent-factory/domain';
import { FilmDeferredError, FilmRefusedError, type FilmDeferralKind } from '../film/film-errors.ts';
import type { FilmOrder, QueuedFilm } from '../film/film-order.ts';
import type { FilmRunner } from '../film/film-runner.ts';
import { FilmToolReadings, type WantedTool } from '../film/film-tool-readings.ts';
import { filmToolKey, type FilmLaneTools } from '../film/film-tools.ts';
import { NOTICES, type OperatorNotifications } from '../notifications/operator-notifications.ts';
import type { Clock, OperationLog } from '../ports.ts';
import { SLOTS_FREE, SLOTS_HELD, type SchedulingHold } from './scheduling-hold.ts';
import type { PauseSet } from './scheduling-pauses.ts';

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
  /** The tools its films need to start; null when they need none. */
  readonly tools: FilmLaneTools | null;
  /** The pauses recorded for this project alone; the installation's are given at each tick. */
  pauses(): Promise<PauseSet>;
}

export interface FilmLaneSettings {
  readonly clock: Clock;
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

function oldestOf(waiting: readonly WaitingFilm[]): WaitingFilm | null {
  return waiting.toSorted((left, right) => left.queued.queuedSequence - right.queued.queuedSequence)[0] ?? null;
}

/** A project whose films wait for the checks of some tools before they start. */
type ToolNeedingProject = FilmLaneProject & { readonly tools: FilmLaneTools };

function needsTools(project: FilmLaneProject): project is ToolNeedingProject {
  return project.tools !== null && project.tools.required.length > 0;
}

function wantedBy(project: ToolNeedingProject): readonly WantedTool[] {
  return project.tools.required.map((tool) => ({ key: filmToolKey(project.projectId, tool), tool, checks: project.tools.checks }));
}

function toleratesFilms(pauses: PauseSet): boolean {
  return [...pauses.keys()].every((cause) => FILM_TOLERATED_PAUSES.includes(cause));
}

/**
 * The one queue of films of the installation. A film starts when nothing else runs, in any
 * project, and while it records it holds every slot. The film ordered first goes first,
 * whichever project it belongs to; a project the operator paused keeps its films waiting.
 *
 * A project may list tools its films need. Their checks run before a film of the project starts, and
 * while a tool fails, the films of the project stay queued and hold no slot: nothing fails, and the
 * other projects' films go on. The failing tool is checked again at a bounded interval.
 */
export class FilmLane implements InstallationFilms {
  private readonly projects: readonly FilmLaneProject[];
  private readonly readings: FilmToolReadings;
  private recording: Promise<void> | null = null;
  /** Why the first film of the queue could not start at the last tick; null while it waits for running work. */
  private deferral: FilmDeferralKind | null = null;

  constructor(projects: readonly FilmLaneProject[], settings: FilmLaneSettings) {
    this.projects = projects;
    this.readings = new FilmToolReadings(settings.clock);
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
    const queued = await this.queuedFilms(eligible);
    const waiting = oldestOf(await this.withoutToolWaits(eligible, queued, workRunning));
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

  /** The film each eligible project would record next. */
  private async queuedFilms(eligible: readonly FilmLaneProject[]): Promise<readonly WaitingFilm[]> {
    const waiting: WaitingFilm[] = [];
    for (const project of eligible) {
      const queued = await project.films.next();
      if (queued !== null) waiting.push({ project, queued });
    }
    return waiting;
  }

  /** The queued films whose project has no tool failing its check; the waits of the others are recorded, and closed for those that no longer wait. */
  private async withoutToolWaits(eligible: readonly FilmLaneProject[], queued: readonly WaitingFilm[], workRunning: boolean): Promise<readonly WaitingFilm[]> {
    const needing = eligible.filter(needsTools);
    if (needing.length === 0) return queued;
    const decision = await this.decideOnReadings(queued, workRunning);
    await this.recordWaits(needing, queued, decision.blocked);
    const blocked = new Set(decision.blocked.map((block) => block.project));
    return queued.filter(({ project }) => !blocked.has(project.projectId));
  }

  /**
   * Decides on the readings of the tools: those of the films that wait are read when they are missing or old, and those
   * of a film that could start now are read again first, since a film starts on a fresh reading.
   */
  private async decideOnReadings(queued: readonly WaitingFilm[], workRunning: boolean): Promise<FilmStartDecision> {
    this.readings.beginRound();
    const needing = queued.map(({ project }) => project).filter(needsTools);
    await this.seedFromRecords(needing);
    await this.readings.read(needing.flatMap(wantedBy), 'due');
    let decision = this.decide(queued);
    while (decision.start !== null && !workRunning) {
      const candidate = needing.find((project) => project.projectId === decision.start?.project);
      if (candidate === undefined) break;
      await this.readings.read(wantedBy(candidate), 'now');
      const afterReading = this.decide(queued);
      if (afterReading.start?.project === decision.start.project) break;
      decision = afterReading;
    }
    return decision;
  }

  private decide(queued: readonly WaitingFilm[]): FilmStartDecision {
    const queue: QueuedFilmNeed[] = queued.map(({ project, queued: film }) => ({
      project: project.projectId,
      queuedSequence: film.queuedSequence,
      tools: (project.tools?.required ?? []).map((tool) => filmToolKey(project.projectId, tool)),
    }));
    return decideFilmStart(queue, this.readings.statuses());
  }

  /** A wait the log records that nobody has read since the factory started is read again at once. */
  private async seedFromRecords(projects: readonly ToolNeedingProject[]): Promise<void> {
    for (const { projectId, tools } of projects) {
      const wait = await tools.wait.current();
      const tool = wait === null ? undefined : tools.required.find((candidate) => candidate.name === wait.tool);
      if (wait === null || tool === undefined) continue;
      this.readings.seed(filmToolKey(projectId, tool), tool, { tool: tool.name, status: wait.status, version: null, detail: wait.detail, fixCommand: wait.fixCommand });
    }
  }

  private async recordWaits(needing: readonly ToolNeedingProject[], queued: readonly WaitingFilm[], blocked: readonly FilmToolBlock[]): Promise<void> {
    for (const { projectId, tools } of needing) {
      const block = blocked.find((candidate) => candidate.project === projectId);
      if (block === undefined) {
        await tools.wait.available(queued.some((film) => film.project.projectId === projectId));
        continue;
      }
      const reading = this.readings.reading(block.tool);
      if (reading === undefined) continue;
      const recorded = await tools.wait.current();
      const sameAsRecorded = recorded !== null && recorded.tool === reading.tool.name && recorded.status === block.status && recorded.detail === reading.result.detail;
      if (this.readings.wasReadInThisRound(block.tool) || !sameAsRecorded) {
        await tools.wait.unavailable({ tool: reading.tool, status: block.status, detail: reading.result.detail, fixCommand: reading.result.fixCommand });
      }
    }
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
