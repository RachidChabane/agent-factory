import type { CockpitSnapshot, StreamEvent } from '../contract/index.ts';
import { mergeActivity } from './activity.ts';
import type { CockpitState, ConnectionState, MessageChannel } from './state.ts';
import { INITIAL_STATE, RECENT_REJECTIONS_KEPT } from './state.ts';

type Listener = () => void;

export class CockpitStore {
  private state: CockpitState;
  private readonly listeners = new Set<Listener>();

  constructor(initial: CockpitState = INITIAL_STATE) {
    this.state = initial;
  }

  readonly getState = (): CockpitState => this.state;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** A freshly loaded snapshot replaces the previous one; events already seen stay in the feed. */
  replaceSnapshot(snapshot: CockpitSnapshot): void {
    this.update({
      ...this.state,
      snapshot,
      lastSequence: Math.max(this.state.lastSequence, snapshot.sequence),
      loadError: null,
      activity: mergeActivity(snapshot.activity, this.state.activity),
    });
  }

  /** Changes the snapshot in place, as telemetry and run logs do between two loads. */
  patchSnapshot(update: (snapshot: CockpitSnapshot) => CockpitSnapshot): void {
    const snapshot = this.state.snapshot;
    if (snapshot === null) return;
    const next = update(snapshot);
    if (next !== snapshot) this.update({ ...this.state, snapshot: next });
  }

  /** Records an event of the stream once; an event already in the feed is ignored. */
  recordEvent(event: StreamEvent): boolean {
    if (this.state.activity.some((entry) => entry.sequence === event.sequence)) return false;
    this.update({
      ...this.state,
      lastSequence: Math.max(this.state.lastSequence, event.sequence),
      activity: mergeActivity([event], this.state.activity),
    });
    return true;
  }

  setConnection(connection: Partial<ConnectionState>): void {
    this.update({ ...this.state, connection: { ...this.state.connection, ...connection } });
  }

  setLoadError(message: string | null): void {
    this.update({ ...this.state, loadError: message });
  }

  reject(channel: MessageChannel, reason: string, at: number): void {
    const recent = [{ channel, reason, at }, ...this.state.recentRejections].slice(0, RECENT_REJECTIONS_KEPT);
    this.update({ ...this.state, rejectedCount: this.state.rejectedCount + 1, recentRejections: recent });
  }

  private update(next: CockpitState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
