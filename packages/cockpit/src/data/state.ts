import type { CockpitSnapshot, StreamEvent } from '../contract/index.ts';

export const CONNECTION_STATUSES = ['connecting', 'live', 'reconnecting', 'offline'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const MESSAGE_CHANNELS = ['snapshot', 'factory', 'run-log', 'run-log-page', 'telemetry', 'command'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const RECENT_REJECTIONS_KEPT = 20;
export const ACTIVITY_ENTRIES_KEPT = 200;

export interface ConnectionState {
  readonly status: ConnectionStatus;
  readonly attempt: number;
  readonly nextRetryAt: number | null;
  readonly lastMessageAt: number | null;
}

export interface RejectedMessage {
  readonly channel: MessageChannel;
  readonly reason: string;
  readonly at: number;
}

export interface CockpitState {
  readonly connection: ConnectionState;
  readonly snapshot: CockpitSnapshot | null;
  /** The highest event sequence seen, whether it came with a snapshot or from the stream. */
  readonly lastSequence: number;
  readonly loadError: string | null;
  readonly rejectedCount: number;
  readonly recentRejections: readonly RejectedMessage[];
  /** The installation's events, newest first: the snapshot's own feed, then what the stream brought. */
  readonly activity: readonly StreamEvent[];
}

export const INITIAL_CONNECTION: ConnectionState = {
  status: 'connecting',
  attempt: 0,
  nextRetryAt: null,
  lastMessageAt: null,
};

export const INITIAL_STATE: CockpitState = {
  connection: INITIAL_CONNECTION,
  snapshot: null,
  lastSequence: 0,
  loadError: null,
  rejectedCount: 0,
  recentRejections: [],
  activity: [],
};
