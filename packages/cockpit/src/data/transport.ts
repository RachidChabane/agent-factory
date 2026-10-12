export interface StreamHandlers {
  onOpen(): void;
  onFactoryEvent(data: string): void;
  onRunLog(data: string): void;
  onTelemetry(data: string): void;
  onDisconnect(): void;
}

export interface StreamSubscription {
  close(): void;
}

export interface CockpitTransport {
  loadSnapshot(): Promise<unknown>;
  openStream(afterSequence: number, handlers: StreamHandlers): StreamSubscription;
  loadRunLog(runId: string, afterIndex: number | null): Promise<unknown>;
  /** What a pull request changes, file by file, read when asked for. */
  loadPullRequestDiff(project: string, pullRequestNumber: number): Promise<unknown>;
  sendCommand(name: string, body: unknown): Promise<unknown>;
}

export class TransportError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'TransportError';
    this.status = status;
  }
}
