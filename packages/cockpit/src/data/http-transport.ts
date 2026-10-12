import {
  COMMAND_TOKEN_HEADER,
  COMMAND_TOKEN_META_NAME,
  CommandRejectedSchema,
  STREAM_FACTORY_EVENT,
  STREAM_RUN_LOG_EVENT,
  STREAM_TELEMETRY_EVENT,
  API_STATE_PATH,
  commandPath,
  eventsPath,
  pullRequestDiffPath,
  runLogPath,
} from '../contract/index.ts';
import type { CockpitTransport, StreamHandlers, StreamSubscription } from './transport.ts';
import { TransportError } from './transport.ts';

const JSON_CONTENT_TYPE = 'application/json';

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
}

export type EventSourceFactory = (url: string) => EventSourceLike;
export type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>;

function messageText(event: MessageEvent<unknown>): string {
  return typeof event.data === 'string' ? event.data : '';
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new TransportError(`invalid JSON from ${response.url}`, response.status);
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const parsed = CommandRejectedSchema.safeParse(await readJson(response));
    if (parsed.success) return parsed.data.error;
  } catch {
    return `HTTP ${response.status}`;
  }
  return `HTTP ${response.status}`;
}

export class HttpTransport implements CockpitTransport {
  private readonly fetchFn: FetchFunction;
  private readonly createEventSource: EventSourceFactory;
  private readonly commandToken: string | null;

  constructor(fetchFn: FetchFunction, createEventSource: EventSourceFactory, commandToken: string | null = null) {
    this.fetchFn = fetchFn;
    this.createEventSource = createEventSource;
    this.commandToken = commandToken;
  }

  async loadSnapshot(): Promise<unknown> {
    return this.getJson(API_STATE_PATH);
  }

  async loadRunLog(runId: string, afterIndex: number | null): Promise<unknown> {
    return this.getJson(runLogPath(runId, afterIndex));
  }

  async loadPullRequestDiff(project: string, pullRequestNumber: number): Promise<unknown> {
    return this.getJson(pullRequestDiffPath(project, pullRequestNumber));
  }

  async sendCommand(name: string, body: unknown): Promise<unknown> {
    const response = await this.fetchFn(commandPath(name), {
      method: 'POST',
      headers: { 'content-type': JSON_CONTENT_TYPE, accept: JSON_CONTENT_TYPE, ...(this.commandToken === null ? {} : { [COMMAND_TOKEN_HEADER]: this.commandToken }) },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new TransportError(await errorMessage(response), response.status);
    return readJson(response);
  }

  openStream(afterSequence: number, handlers: StreamHandlers): StreamSubscription {
    const source = this.createEventSource(eventsPath(afterSequence));
    let closed = false;
    source.onopen = () => {
      if (!closed) handlers.onOpen();
    };
    source.onerror = () => {
      if (closed) return;
      closed = true;
      source.close();
      handlers.onDisconnect();
    };
    source.addEventListener(STREAM_FACTORY_EVENT, (event) => handlers.onFactoryEvent(messageText(event)));
    source.addEventListener(STREAM_RUN_LOG_EVENT, (event) => handlers.onRunLog(messageText(event)));
    source.addEventListener(STREAM_TELEMETRY_EVENT, (event) => handlers.onTelemetry(messageText(event)));
    return {
      close: () => {
        closed = true;
        source.close();
      },
    };
  }

  private async getJson(path: string): Promise<unknown> {
    const response = await this.fetchFn(path, { headers: { accept: JSON_CONTENT_TYPE } });
    if (!response.ok) throw new TransportError(await errorMessage(response), response.status);
    return readJson(response);
  }
}

export function pageCommandToken(page: Document): string | null {
  const content = page.querySelector(`meta[name="${COMMAND_TOKEN_META_NAME}"]`)?.getAttribute('content') ?? null;
  return content === null || content === '' ? null : content;
}

export function createBrowserTransport(): HttpTransport {
  return new HttpTransport(
    (input, init) => fetch(input, init),
    (url) => new EventSource(url),
    pageCommandToken(document),
  );
}
