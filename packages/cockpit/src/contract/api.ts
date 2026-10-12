export const API_STATE_PATH = '/api/state';
export const API_EVENTS_PATH = '/api/events';
export const API_COMMANDS_PATH = '/api/commands';
export const API_RUNS_PATH = '/api/runs';
export const API_PROJECTS_PATH = '/api/projects';
export const AFTER_QUERY_PARAMETER = 'after';
export const EVIDENCE_SEGMENT = 'evidence';
export const REQUESTS_SEGMENT = 'requests';
export const FORGE_SEGMENT = 'forge';

export const STREAM_FACTORY_EVENT = 'factory';
export const STREAM_RUN_LOG_EVENT = 'run-log';
export const STREAM_TELEMETRY_EVENT = 'telemetry';

export function runLogPath(runId: string, afterIndex: number | null): string {
  const base = `${API_RUNS_PATH}/${encodeURIComponent(runId)}/log`;
  return afterIndex === null ? base : `${base}?${AFTER_QUERY_PARAMETER}=${afterIndex}`;
}

export function eventsPath(afterSequence: number): string {
  return `${API_EVENTS_PATH}?${AFTER_QUERY_PARAMETER}=${afterSequence}`;
}

export function commandPath(name: string): string {
  return `${API_COMMANDS_PATH}/${encodeURIComponent(name)}`;
}

function relativePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** A file of an issue's evidence, served from the project's evidence directory. */
export function evidencePath(project: string, issueNumber: number, path: string): string {
  return `${API_PROJECTS_PATH}/${encodeURIComponent(project)}/${EVIDENCE_SEGMENT}/${issueNumber}/${relativePath(path)}`;
}

/** An attachment of a request, served from the project's requests directory. */
export function requestAttachmentPath(project: string, requestId: string, path: string): string {
  return `${API_PROJECTS_PATH}/${encodeURIComponent(project)}/${REQUESTS_SEGMENT}/${encodeURIComponent(requestId)}/${relativePath(path)}`;
}

/** A file of a project's local forge (its issues and pull requests), which a browser cannot open from disk. */
export function forgeFilePath(project: string, path: string): string {
  return `${API_PROJECTS_PATH}/${encodeURIComponent(project)}/${FORGE_SEGMENT}/${relativePath(path)}`;
}

export const COCKPIT_DEV_SERVER_PORT = 5199;
export const COMMAND_TOKEN_HEADER = 'x-factory-command-token';
export const COMMAND_TOKEN_META_NAME = 'factory-command-token';
