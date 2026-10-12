import type { CockpitSnapshot } from '../contract/index.ts';
import type { CockpitTransport, StreamHandlers, StreamSubscription } from '../data/transport.ts';

export interface SentCommand {
  readonly name: string;
  readonly body: unknown;
}

export class FakeTransport implements CockpitTransport {
  snapshot: unknown;
  readonly commands: SentCommand[] = [];
  readonly runLogs = new Map<string, unknown>();
  handlers: StreamHandlers | null = null;
  openedAfter: number[] = [];
  snapshotLoads = 0;
  failSnapshot = false;
  commandFailure: string | null = null;
  private sequence: number;

  constructor(snapshot: CockpitSnapshot | unknown, sequence = 0) {
    this.snapshot = snapshot;
    this.sequence = sequence;
  }

  async loadSnapshot(): Promise<unknown> {
    this.snapshotLoads += 1;
    if (this.failSnapshot) throw new Error('connection refused');
    return JSON.parse(JSON.stringify(this.snapshot));
  }

  openStream(afterSequence: number, handlers: StreamHandlers): StreamSubscription {
    this.openedAfter.push(afterSequence);
    this.handlers = handlers;
    return {
      close: () => {
        if (this.handlers === handlers) this.handlers = null;
      },
    };
  }

  readonly runLogRequests: { readonly runId: string; readonly afterIndex: number | null }[] = [];

  async loadRunLog(runId: string, afterIndex: number | null): Promise<unknown> {
    this.runLogRequests.push({ runId, afterIndex });
    return this.runLogs.get(runId) ?? { runId, total: 0, lines: [] };
  }

  async sendCommand(name: string, body: unknown): Promise<unknown> {
    this.commands.push({ name, body });
    if (this.commandFailure !== null) throw new Error(this.commandFailure);
    this.sequence += 1;
    return { sequence: this.sequence };
  }

  emitFactory(record: unknown): void {
    this.handlers?.onFactoryEvent(JSON.stringify(record));
  }

  emitRunLog(line: unknown): void {
    this.handlers?.onRunLog(JSON.stringify(line));
  }

  emitTelemetry(sample: unknown): void {
    this.handlers?.onTelemetry(JSON.stringify(sample));
  }
}
