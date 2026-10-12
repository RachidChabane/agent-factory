import type { CockpitSnapshot } from '../contract/index.ts';
import type { ActivityEntry, CockpitState, ConnectionState, MessageChannel } from './state.ts';
import { ACTIVITY_ENTRIES_KEPT, INITIAL_STATE, RECENT_REJECTIONS_KEPT } from './state.ts';

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

  replaceSnapshot(snapshot: CockpitSnapshot): void {
    this.update({ ...this.state, snapshot, lastSequence: snapshot.sequence, loadError: null });
  }

  updateSnapshot(snapshot: CockpitSnapshot, lastSequence: number, activity: readonly ActivityEntry[]): void {
    const merged = activity.length === 0 ? this.state.activity : [...activity.toReversed(), ...this.state.activity];
    this.update({
      ...this.state,
      snapshot,
      lastSequence,
      activity: merged.slice(0, ACTIVITY_ENTRIES_KEPT),
    });
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
