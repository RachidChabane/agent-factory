import { z } from 'zod';
import { TOOL_SESSION_OUTCOMES, type ToolProbeResult, type ToolSessionOutcome } from '@agent-factory/domain';
import type { InstallationTask } from '../daemon/installation-daemon.ts';
import type { Clock, EventStore, FactoryEventRecord, OperationLog } from '../ports.ts';
import { SETTINGS_SUBJECT } from './settings-events.ts';
import { checkTool, type ToolProber } from './tool-checks.ts';

/** The operator started a tool's login, and how it ended. */
export const TOOL_LOGIN_FINISHED_EVENT = 'settings.tool-login-finished';
/** The daemon ran the command that keeps a tool's session alive, and how it ended. */
export const TOOL_SESSION_KEPT_EVENT = 'settings.tool-session-kept';
export const TOOL_SESSION_PURPOSES = ['login', 'keep-alive'] as const;
export type ToolSessionPurpose = (typeof TOOL_SESSION_PURPOSES)[number];

export const ToolSessionPayloadSchema = z.object({
  tool: z.string().min(1),
  outcome: z.enum(TOOL_SESSION_OUTCOMES),
  /** How the command ended, never what it printed: a login may print the credential it obtained. */
  detail: z.string(),
  operator: z.string().min(1),
});
export type ToolSessionPayload = z.infer<typeof ToolSessionPayloadSchema>;

export interface ToolSessionRun {
  readonly outcome: ToolSessionOutcome;
  readonly detail: string;
}

/** Runs the session commands a tool declares: its login, and the command that keeps its session alive. */
export interface ToolSessionCommands {
  run(tool: string, purpose: ToolSessionPurpose, signal: AbortSignal): Promise<ToolSessionRun>;
}

export class ToolLoginUnavailableError extends Error {
  constructor(tool: string) {
    super(`${tool} declares no login the factory can start; log in from a terminal as its fix says`);
    this.name = 'ToolLoginUnavailableError';
  }
}

export interface ToolLogin {
  readonly login: ToolSessionRun;
  readonly check: ToolProbeResult;
}

export interface ToolSessionDependencies {
  readonly events: EventStore;
  readonly sessions: ToolSessionCommands;
  readonly prober: ToolProber;
}

/** Starts a tool's declared login for the operator, records how it ended, then checks the tool again. */
export async function logInTool(dependencies: ToolSessionDependencies, tool: string, operator: string, signal: AbortSignal): Promise<ToolLogin> {
  const login = await dependencies.sessions.run(tool, 'login', signal);
  const payload: ToolSessionPayload = { tool, outcome: login.outcome, detail: login.detail, operator };
  await dependencies.events.append(TOOL_LOGIN_FINISHED_EVENT, SETTINGS_SUBJECT, payload);
  return { login, check: await checkTool(dependencies.events, dependencies.prober, tool, operator) };
}

export interface RecordedToolSession extends ToolSessionPayload {
  readonly at: Date;
}

export interface ToolSessionHistory {
  readonly lastLogin: RecordedToolSession | null;
  readonly lastKeepAlive: RecordedToolSession | null;
}

const PURPOSE_OF_EVENT: Readonly<Record<string, keyof ToolSessionHistory>> = {
  [TOOL_LOGIN_FINISHED_EVENT]: 'lastLogin',
  [TOOL_SESSION_KEPT_EVENT]: 'lastKeepAlive',
};

/** The latest login and keep-alive of each tool, from the settings events of one scope. */
export function latestToolSessions(records: readonly FactoryEventRecord[]): ReadonlyMap<string, ToolSessionHistory> {
  const latest = new Map<string, ToolSessionHistory>();
  for (const record of records) {
    const field = record.subject === SETTINGS_SUBJECT ? PURPOSE_OF_EVENT[record.type] : undefined;
    if (field === undefined) continue;
    const parsed = ToolSessionPayloadSchema.safeParse(record.payload);
    if (!parsed.success) continue;
    const known = latest.get(parsed.data.tool) ?? { lastLogin: null, lastKeepAlive: null };
    latest.set(parsed.data.tool, { ...known, [field]: { ...parsed.data, at: record.occurredAt } });
  }
  return latest;
}

/** A tool whose session the daemon keeps alive, every so often. */
export interface KeptSession {
  readonly tool: string;
  readonly everyMs: number;
}

export interface ToolSessionKeepersSettings {
  readonly scope: string;
  readonly sessions: readonly KeptSession[];
  /** Who the factory acts for when it keeps a session alive. */
  readonly operator: string;
}

/**
 * Keeps the sessions of the tools that declare a keep-alive command: each runs at the first tick, so a session
 * is checked when the factory starts, then once per its interval. Each run is recorded, and the tool checked again.
 */
export class ToolSessionKeepers implements InstallationTask {
  readonly name: string;
  private readonly dependencies: ToolSessionDependencies & { readonly clock: Clock; readonly log: OperationLog };
  private readonly settings: ToolSessionKeepersSettings;
  private readonly lastRunAt = new Map<string, number>();

  constructor(dependencies: ToolSessionDependencies & { readonly clock: Clock; readonly log: OperationLog }, settings: ToolSessionKeepersSettings) {
    this.dependencies = dependencies;
    this.settings = settings;
    this.name = `keeping the tool sessions of ${settings.scope}`;
  }

  async run(signal: AbortSignal): Promise<void> {
    for (const session of this.settings.sessions) {
      if (signal.aborted) return;
      const now = this.dependencies.clock.now().getTime();
      const last = this.lastRunAt.get(session.tool);
      if (last !== undefined && now - last < session.everyMs) continue;
      this.lastRunAt.set(session.tool, now);
      await this.keep(session.tool, signal);
    }
  }

  private async keep(tool: string, signal: AbortSignal): Promise<void> {
    const { events, sessions, prober, log } = this.dependencies;
    const kept = await sessions.run(tool, 'keep-alive', signal);
    if (signal.aborted) return;
    const payload: ToolSessionPayload = { tool, outcome: kept.outcome, detail: kept.detail, operator: this.settings.operator };
    await events.append(TOOL_SESSION_KEPT_EVENT, SETTINGS_SUBJECT, payload);
    if (kept.outcome !== 'succeeded') log.warn(`the session of ${tool} could not be kept alive: ${kept.detail}`);
    await checkTool(events, prober, tool, this.settings.operator);
  }
}
