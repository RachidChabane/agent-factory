import type { ServerResponse } from 'node:http';
import { parseProjectSubject, type EventStore, type FactoryEventRecord, type RunLogLine, type RunLogStore } from '@agent-factory/application';
import { STREAM_FACTORY_EVENT, STREAM_RUN_LOG_EVENT, STREAM_TELEMETRY_EVENT, type StreamEvent, type TelemetrySample } from '@agent-factory/cockpit';
import { summarizeEvent } from '../projections/event-summary.ts';

export const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
} as const;
export const SSE_RETRY_MS = 2_000;
const ALL_SUBJECTS = '';
const HTTP_OK = 200;
const HEARTBEAT_COMMENT = ': heartbeat\n\n';

export interface EventStreamSettings {
  readonly heartbeatMs: number;
  readonly pollMs: number;
  readonly telemetryMs: number;
}

export interface EventStreamSources {
  readonly events: EventStore;
  readonly runLogs: RunLogStore;
  telemetry(): Promise<TelemetrySample>;
}

/** An event of the installation's log as the cockpit receives it: its project, its own subject and a one-line summary. */
export function streamEventOf(record: FactoryEventRecord): StreamEvent {
  const { project, subject } = parseProjectSubject(record.subject);
  return {
    sequence: record.sequence,
    occurredAt: record.occurredAt.toISOString(),
    type: record.type,
    project,
    subject,
    summary: summarizeEvent({ type: record.type, subject, payload: record.payload }),
  };
}

export function runLogJson(line: RunLogLine): string {
  return JSON.stringify({ runId: line.runId, index: line.index, at: line.at.toISOString(), event: line.event });
}

export class EventStreamConnection {
  private readonly response: ServerResponse;
  private readonly sources: EventStreamSources;
  private readonly settings: EventStreamSettings;
  private lastSent: number;
  private pumping: Promise<void> = Promise.resolve();
  private readonly cleanups: (() => void)[] = [];
  private closed = false;

  constructor(response: ServerResponse, sources: EventStreamSources, settings: EventStreamSettings, afterSequence: number) {
    this.response = response;
    this.sources = sources;
    this.settings = settings;
    this.lastSent = afterSequence;
  }

  start(): void {
    this.response.writeHead(HTTP_OK, SSE_HEADERS);
    this.response.write(`retry: ${SSE_RETRY_MS}\n\n`);
    this.cleanups.push(this.sources.events.subscribe(() => this.pump()));
    this.cleanups.push(this.sources.runLogs.subscribe((line) => this.send(STREAM_RUN_LOG_EVENT, runLogJson(line), null)));
    this.every(this.settings.pollMs, () => this.pump());
    this.every(this.settings.heartbeatMs, () => this.write(HEARTBEAT_COMMENT));
    this.every(this.settings.telemetryMs, () => {
      void this.sources.telemetry().then(
        (sample) => this.send(STREAM_TELEMETRY_EVENT, JSON.stringify(sample), null),
        () => undefined,
      );
    });
    this.response.on('close', () => this.close());
    this.pump();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.response.end();
  }

  private every(intervalMs: number, action: () => void): void {
    const timer = setInterval(action, intervalMs);
    this.cleanups.push(() => clearInterval(timer));
  }

  private pump(): void {
    this.pumping = this.pumping.then(async () => {
      if (this.closed) return;
      const records = await this.sources.events.read(ALL_SUBJECTS, this.lastSent);
      for (const record of records) {
        if (record.sequence <= this.lastSent) continue;
        this.send(STREAM_FACTORY_EVENT, JSON.stringify(streamEventOf(record)), record.sequence);
        this.lastSent = record.sequence;
      }
    }).catch(() => undefined);
  }

  private send(event: string, data: string, id: number | null): void {
    this.write(`${id === null ? '' : `id: ${id}\n`}event: ${event}\ndata: ${data}\n\n`);
  }

  private write(chunk: string): void {
    if (!this.closed) this.response.write(chunk);
  }
}
