import type { ToolName, ToolProbeResult } from '@agent-factory/domain';
import type { FilmToolWaitRecord } from './film-tool-wait.ts';

/**
 * How often the factory reads a tool again while a film waits for it: a tool that fails its check, and a tool that
 * passes while the film waits for the running work to end.
 */
export const FILM_TOOL_RECHECK_INTERVAL_MS = 5 * 60_000;

export const FILM_TOOL_SCOPES = ['installation', 'project'] as const;
export type FilmToolScope = (typeof FILM_TOOL_SCOPES)[number];

/** A tool the films of a project need, as the configuration declares it. */
export interface FilmTool {
  readonly name: ToolName;
  /** Whether the installation declares the tool or the project does. */
  readonly scope: FilmToolScope;
  /** The login the tool declares, which the cockpit and the command line start; null when it declares none. */
  readonly loginCommand: string | null;
}

/** Checks a tool now and records the reading where the tools of its scope keep theirs. */
export interface FilmToolChecks {
  check(tool: FilmTool): Promise<ToolProbeResult>;
}

/** What the lane of the films knows about the tools the films of one project need. */
export interface FilmLaneTools {
  readonly required: readonly FilmTool[];
  readonly checks: FilmToolChecks;
  /** The record of the films waiting for a tool, with the notices it sends. */
  readonly wait: FilmToolWaitRecord;
}

/** An identifier of a tool that is unique in the installation: the tools of a project are told apart by project. */
export function filmToolKey(projectId: string, tool: FilmTool): string {
  return tool.scope === 'installation' ? tool.name : `${projectId}/${tool.name}`;
}
