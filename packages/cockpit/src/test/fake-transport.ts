import type { CockpitSnapshot } from '../contract/index.ts';
import type { CockpitTransport, StreamHandlers, StreamSubscription } from '../data/transport.ts';
import { TransportError } from '../data/transport.ts';

export interface SentCommand {
  readonly name: string;
  readonly body: unknown;
}

const DEFAULT_EFFECT = 'The factory accepted the command.';
const REFUSAL_STATUS = 409;
const NOT_FOUND_STATUS = 404;
const DIFF_FAILURE_STATUS = 500;

export function diffKey(project: string, pullRequestNumber: number): string {
  return `${project}/${pullRequestNumber}`;
}

/** A transport that serves a snapshot and records every command it receives, for tests. */
export class FakeTransport implements CockpitTransport {
  snapshot: unknown;
  readonly commands: SentCommand[] = [];
  readonly runLogs = new Map<string, unknown>();
  /** The diffs the factory serves, by `diffKey(project, number)`. */
  readonly diffs = new Map<string, unknown>();
  readonly diffRequests: { readonly project: string; readonly pullRequestNumber: number }[] = [];
  /** When set, every diff request fails with this error. */
  diffFailure: string | null = null;
  /** What the factory says it did, per command name; the default sentence when a command has none. */
  readonly effects = new Map<string, string>();
  handlers: StreamHandlers | null = null;
  openedAfter: number[] = [];
  snapshotLoads = 0;
  failSnapshot = false;
  /** When set, every command is refused with this error. */
  commandFailure: string | null = null;
  readonly runLogRequests: { readonly runId: string; readonly afterIndex: number | null }[] = [];
  private sequence: number;
  private gate: Promise<void> | null = null;

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

  async loadRunLog(runId: string, afterIndex: number | null): Promise<unknown> {
    this.runLogRequests.push({ runId, afterIndex });
    return this.runLogs.get(runId) ?? { runId, total: 0, lines: [] };
  }

  async loadPullRequestDiff(project: string, pullRequestNumber: number): Promise<unknown> {
    this.diffRequests.push({ project, pullRequestNumber });
    if (this.diffFailure !== null) throw new TransportError(this.diffFailure, DIFF_FAILURE_STATUS);
    const diff = this.diffs.get(diffKey(project, pullRequestNumber));
    if (diff === undefined) throw new TransportError(`the factory knows no pull request ${pullRequestNumber} in ${project}`, NOT_FOUND_STATUS);
    return JSON.parse(JSON.stringify(diff));
  }

  /** Makes commands wait until the returned function is called, to observe a button while its command is in flight. */
  holdCommands(): () => void {
    let release: () => void = () => undefined;
    this.gate = new Promise<void>((resolve) => {
      release = () => {
        this.gate = null;
        resolve();
      };
    });
    return release;
  }

  async sendCommand(name: string, body: unknown): Promise<unknown> {
    this.commands.push({ name, body });
    if (this.gate !== null) await this.gate;
    if (this.commandFailure !== null) throw new TransportError(this.commandFailure, REFUSAL_STATUS);
    this.sequence += 1;
    return { sequence: this.sequence, effect: this.effects.get(name) ?? DEFAULT_EFFECT };
  }

  emitFactory(event: unknown): void {
    this.handlers?.onFactoryEvent(JSON.stringify(event));
  }

  emitRunLog(line: unknown): void {
    this.handlers?.onRunLog(JSON.stringify(line));
  }

  emitTelemetry(sample: unknown): void {
    this.handlers?.onTelemetry(JSON.stringify(sample));
  }
}
