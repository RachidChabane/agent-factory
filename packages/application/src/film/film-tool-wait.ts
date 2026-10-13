import { z } from 'zod';
import { TOOL_FAILURE_STATUSES, type ToolFailureStatus, type ToolName } from '@agent-factory/domain';
import { NOTICES, type OperatorNotifications } from '../notifications/operator-notifications.ts';
import type { EventStore, FactoryEventRecord } from '../ports.ts';
import { latestToolChecks, type CheckedTool } from '../settings/tool-checks.ts';
import { FILM_TOOL_RECHECK_INTERVAL_MS, FILM_TOOL_SCOPES, type FilmTool } from './film-tools.ts';

/** Where a project records that its films wait for a tool. */
export const FILM_TOOLS_SUBJECT = 'films';
export const FILM_TOOLS_UNAVAILABLE_EVENT = 'films.tools-unavailable';
export const FILM_TOOLS_AVAILABLE_EVENT = 'films.tools-available';

const FIRST_SEQUENCE = 0;
const MILLISECONDS_PER_MINUTE = 60_000;

export const FilmToolsUnavailablePayloadSchema = z.object({
  tool: z.string().min(1),
  scope: z.enum(FILM_TOOL_SCOPES),
  status: z.enum(TOOL_FAILURE_STATUSES),
  detail: z.string(),
  /** The login the tool declares; null when it declares none. */
  loginCommand: z.string().min(1).nullable(),
  /** What the tool's check says to run when it fails; null when it says nothing. */
  fixCommand: z.string().min(1).nullable(),
});
export type FilmToolsUnavailablePayload = z.infer<typeof FilmToolsUnavailablePayloadSchema>;

/** The films of a project wait for a tool that fails its check. */
export interface FilmToolWait extends FilmToolsUnavailablePayload {
  /** When the films began to wait; a change of the tool that fails does not move it. */
  readonly since: Date;
  /** When the record of the wait last changed: the tool, or what its check found. */
  readonly checkedAt: Date;
}

/** The wait in force after these events of a project's log, or null when its films wait for no tool. */
export function filmToolWaitOf(records: readonly FactoryEventRecord[]): FilmToolWait | null {
  let wait: FilmToolWait | null = null;
  for (const record of records) {
    if (record.subject !== FILM_TOOLS_SUBJECT) continue;
    if (record.type === FILM_TOOLS_UNAVAILABLE_EVENT) {
      const payload = FilmToolsUnavailablePayloadSchema.safeParse(record.payload);
      const since: Date = wait?.since ?? record.occurredAt;
      if (payload.success) wait = { ...payload.data, since, checkedAt: record.occurredAt };
    } else if (record.type === FILM_TOOLS_AVAILABLE_EVENT) {
      wait = null;
    }
  }
  return wait;
}

/**
 * The wait in force, with the time its tool was last read: the log's latest check of the tool when it is newer than the
 * record of the wait, whoever ran it. A tool of the installation is checked in the installation's log, a tool of the
 * project in the project's.
 */
export function currentFilmToolWait(projectRecords: readonly FactoryEventRecord[], installationChecks: ReadonlyMap<ToolName, CheckedTool>): FilmToolWait | null {
  const wait = filmToolWaitOf(projectRecords);
  if (wait === null) return null;
  const checks = wait.scope === 'project' ? latestToolChecks(projectRecords) : installationChecks;
  const checkedAt = checks.get(wait.tool)?.checkedAt;
  return checkedAt === undefined || checkedAt.getTime() <= wait.checkedAt.getTime() ? wait : { ...wait, checkedAt };
}

/** A tool read failing: what the record keeps of it, and what the notice tells. */
export interface FilmToolFinding {
  readonly tool: FilmTool;
  readonly status: ToolFailureStatus;
  readonly detail: string;
  /** What the tool's check says to run when it fails; null when it says nothing. */
  readonly fixCommand: string | null;
}

/** What the lane asks of the record of a project's films waiting for a tool. */
export interface FilmToolWaitRecord {
  current(): Promise<FilmToolWait | null>;
  /** Records what a tool that fails found; the operator is told once, when the films begin to wait. */
  unavailable(finding: FilmToolFinding): Promise<void>;
  /** Records that the films stop waiting; the operator is told when films were queued and start again. */
  available(resumed: boolean): Promise<void>;
}

export interface FilmToolWaitDependencies {
  readonly projectId: string;
  readonly events: EventStore;
  readonly notifications: OperatorNotifications;
}

/** Keeps the project's record of its films waiting for a tool, and tells the operator when the wait begins and ends. */
export class FilmToolWaitReporter implements FilmToolWaitRecord {
  private readonly dependencies: FilmToolWaitDependencies;

  constructor(dependencies: FilmToolWaitDependencies) {
    this.dependencies = dependencies;
  }

  async current(): Promise<FilmToolWait | null> {
    return filmToolWaitOf(await this.dependencies.events.read(FILM_TOOLS_SUBJECT, FIRST_SEQUENCE));
  }

  async unavailable({ tool, status, detail, fixCommand }: FilmToolFinding): Promise<void> {
    const { events, notifications, projectId } = this.dependencies;
    const begins = (await this.current()) === null;
    const payload: FilmToolsUnavailablePayload = { tool: tool.name, scope: tool.scope, status, detail, loginCommand: tool.loginCommand, fixCommand };
    await events.append(FILM_TOOLS_UNAVAILABLE_EVENT, FILM_TOOLS_SUBJECT, payload);
    if (begins) await notifications.send(NOTICES.filmToolsUnavailable({ projectId, ...payload, recheckEveryMinutes: FILM_TOOL_RECHECK_INTERVAL_MS / MILLISECONDS_PER_MINUTE }));
  }

  async available(resumed: boolean): Promise<void> {
    const { events, notifications, projectId } = this.dependencies;
    const wait = await this.current();
    if (wait === null) return;
    await events.append(FILM_TOOLS_AVAILABLE_EVENT, FILM_TOOLS_SUBJECT, {});
    if (resumed) await notifications.send(NOTICES.filmToolsAvailable({ projectId, tool: wait.tool }));
  }
}
