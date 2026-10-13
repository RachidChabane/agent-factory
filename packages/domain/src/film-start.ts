import { isToolFailure, type ToolFailureStatus, type ToolStatus } from './tool-connection.ts';

/** A film waiting for its turn in the installation's queue, with the tools its project's films need. */
export interface QueuedFilmNeed {
  readonly project: string;
  /** Where the film stands in the installation's queue: the lowest goes first. */
  readonly queuedSequence: number;
  /** The tools the film needs, each by an identifier that is unique in the installation. */
  readonly tools: readonly string[];
}

/** The tool a project's films wait for. */
export interface FilmToolBlock {
  readonly project: string;
  readonly tool: string;
  readonly status: ToolFailureStatus;
}

export interface FilmStartDecision {
  /** The film to start: the first in the queue whose tools all pass; null when no film can start. */
  readonly start: QueuedFilmNeed | null;
  /** The projects whose films wait for a tool, in the order of their first film in the queue, each with the first tool that fails. */
  readonly blocked: readonly FilmToolBlock[];
}

function failingTool(film: QueuedFilmNeed, readings: ReadonlyMap<string, ToolStatus>): { readonly tool: string; readonly status: ToolFailureStatus } | null {
  for (const tool of film.tools) {
    const status = readings.get(tool);
    if (status !== undefined && isToolFailure(status)) return { tool, status };
  }
  return null;
}

/**
 * Which film of the queue starts, and which projects' films wait for a tool. The films go in the order they were
 * queued; a film whose project has a tool that fails its check does not start, and does not fail: it waits, and so do
 * the other films of its project. The films of the other projects go on. A tool that was not read is not held against
 * a film: whoever is about to start a film reads its tools first.
 */
export function decideFilmStart(queue: readonly QueuedFilmNeed[], readings: ReadonlyMap<string, ToolStatus>): FilmStartDecision {
  let start: QueuedFilmNeed | null = null;
  const blocked: FilmToolBlock[] = [];
  for (const film of queue.toSorted((left, right) => left.queuedSequence - right.queuedSequence)) {
    const failing = failingTool(film, readings);
    if (failing === null) {
      start ??= film;
    } else if (!blocked.some((block) => block.project === film.project)) {
      blocked.push({ project: film.project, ...failing });
    }
  }
  return { start, blocked };
}
