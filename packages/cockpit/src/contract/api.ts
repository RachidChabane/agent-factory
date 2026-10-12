export const API_STATE_PATH = '/api/state';
export const API_EVENTS_PATH = '/api/events';
export const API_COMMANDS_PATH = '/api/commands';
export const API_RUNS_PATH = '/api/runs';
export const API_EVIDENCE_PATH = '/api/evidence';
export const AFTER_QUERY_PARAMETER = 'after';

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

export const COCKPIT_DEV_SERVER_PORT = 5199;
export const COMMAND_TOKEN_HEADER = 'x-factory-command-token';
export const COMMAND_TOKEN_META_NAME = 'factory-command-token';
