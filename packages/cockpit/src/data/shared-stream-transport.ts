import { STREAM_FACTORY_EVENT, STREAM_RUN_LOG_EVENT, STREAM_TELEMETRY_EVENT } from '../contract/index.ts';
import type { FrameChannel, StreamMessage } from './shared-stream-protocol.ts';
import { sequenceOfFrame, STREAM_CHANNEL_NAME, STREAM_LOCK_NAME, StreamMessageSchema } from './shared-stream-protocol.ts';
import type { CockpitTransport, StreamHandlers, StreamSubscription } from './transport.ts';

export interface LockRequestOptions {
  readonly signal: AbortSignal;
}

/** The part of the browser's Web Locks that the election needs. */
export interface LockManagerLike {
  request(name: string, options: LockRequestOptions, callback: () => Promise<void>): Promise<unknown>;
}

/** The part of a BroadcastChannel that the relay needs. */
export interface MessageChannelLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(message: StreamMessage): void;
  close(): void;
}

export interface SharedStreamEnvironment {
  readonly locks: LockManagerLike;
  createChannel(name: string): MessageChannelLike;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * One tab's part in the shared stream. The tabs of a browser queue for one lock: the holder opens the real stream and
 * relays every frame to the others; a tab that waits takes over when the holder goes away, resuming after the last
 * frame it saw.
 */
class StreamSession implements StreamSubscription {
  private readonly environment: SharedStreamEnvironment;
  private readonly inner: CockpitTransport;
  private readonly handlers: StreamHandlers;
  private readonly channel: MessageChannelLike;
  private readonly abort = new AbortController();
  private resumeAfter: number;
  private upstream: StreamSubscription | null = null;
  private upstreamOpen = false;
  private leading = false;
  private ended = false;
  private releaseLock: (() => void) | null = null;

  constructor(environment: SharedStreamEnvironment, inner: CockpitTransport, afterSequence: number, handlers: StreamHandlers) {
    this.environment = environment;
    this.inner = inner;
    this.handlers = handlers;
    this.resumeAfter = afterSequence;
    this.channel = environment.createChannel(STREAM_CHANNEL_NAME);
  }

  start(): void {
    this.channel.onmessage = (event) => this.receive(event.data);
    this.channel.postMessage({ kind: 'hello' });
    this.environment.locks.request(STREAM_LOCK_NAME, { signal: this.abort.signal }, () => this.lead()).catch((error: unknown) => {
      if (!isAbort(error)) throw error;
    });
  }

  close(): void {
    this.end();
  }

  private lead(): Promise<void> {
    if (this.ended) return Promise.resolve();
    this.leading = true;
    this.upstream = this.inner.openStream(this.resumeAfter, {
      onOpen: () => {
        this.upstreamOpen = true;
        this.channel.postMessage({ kind: 'open' });
        this.handlers.onOpen();
      },
      onFactoryEvent: (data) => this.forward(STREAM_FACTORY_EVENT, data),
      onRunLog: (data) => this.forward(STREAM_RUN_LOG_EVENT, data),
      onTelemetry: (data) => this.forward(STREAM_TELEMETRY_EVENT, data),
      onDisconnect: () => {
        this.channel.postMessage({ kind: 'disconnect' });
        this.end();
        this.handlers.onDisconnect();
      },
    });
    return new Promise<void>((resolve) => {
      this.releaseLock = resolve;
    });
  }

  private forward(channel: FrameChannel, data: string): void {
    this.channel.postMessage({ kind: 'frame', channel, data });
    this.deliver(channel, data);
  }

  private deliver(channel: FrameChannel, data: string): void {
    if (channel === STREAM_FACTORY_EVENT) {
      this.resumeAfter = Math.max(this.resumeAfter, sequenceOfFrame(data) ?? this.resumeAfter);
      this.handlers.onFactoryEvent(data);
    } else if (channel === STREAM_RUN_LOG_EVENT) {
      this.handlers.onRunLog(data);
    } else {
      this.handlers.onTelemetry(data);
    }
  }

  private receive(raw: unknown): void {
    const parsed = StreamMessageSchema.safeParse(raw);
    if (!parsed.success || this.ended) return;
    const message = parsed.data;
    if (this.leading) {
      if (message.kind === 'hello' && this.upstreamOpen) this.channel.postMessage({ kind: 'open' });
      return;
    }
    if (message.kind === 'open') this.handlers.onOpen();
    else if (message.kind === 'frame') this.deliver(message.channel, message.data);
    else if (message.kind === 'disconnect') {
      this.end();
      this.handlers.onDisconnect();
    }
  }

  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.abort.abort();
    this.upstream?.close();
    this.upstream = null;
    this.releaseLock?.();
    this.releaseLock = null;
    this.channel.onmessage = null;
    this.channel.close();
  }
}

/**
 * The transport of a tab among the tabs of one browser: it loads and sends through the plain transport, and shares one
 * event stream with the other tabs, because an HTTP/1.1 browser serves only six connections per host.
 */
export class SharedStreamTransport implements CockpitTransport {
  private readonly inner: CockpitTransport;
  private readonly environment: SharedStreamEnvironment;

  constructor(inner: CockpitTransport, environment: SharedStreamEnvironment) {
    this.inner = inner;
    this.environment = environment;
  }

  loadSnapshot(): Promise<unknown> {
    return this.inner.loadSnapshot();
  }

  loadRunLog(runId: string, afterIndex: number | null): Promise<unknown> {
    return this.inner.loadRunLog(runId, afterIndex);
  }

  loadPullRequestDiff(project: string, pullRequestNumber: number): Promise<unknown> {
    return this.inner.loadPullRequestDiff(project, pullRequestNumber);
  }

  sendCommand(name: string, body: unknown): Promise<unknown> {
    return this.inner.sendCommand(name, body);
  }

  openStream(afterSequence: number, handlers: StreamHandlers): StreamSubscription {
    const session = new StreamSession(this.environment, this.inner, afterSequence, handlers);
    session.start();
    return session;
  }
}

/** The locks and channels of this browser, or null when it has none, in which case every tab keeps its own stream. */
export function browserSharedStreamEnvironment(): SharedStreamEnvironment | null {
  if (typeof navigator === 'undefined' || navigator.locks === undefined || typeof BroadcastChannel === 'undefined') return null;
  const { locks } = navigator;
  return {
    locks: { request: (name, options, callback) => locks.request(name, { signal: options.signal }, callback) },
    createChannel: (name) => {
      const channel = new BroadcastChannel(name);
      const adapter: MessageChannelLike = {
        onmessage: null,
        postMessage: (message) => channel.postMessage(message),
        close: () => channel.close(),
      };
      channel.onmessage = (event: MessageEvent<unknown>) => adapter.onmessage?.({ data: event.data });
      return adapter;
    },
  };
}
