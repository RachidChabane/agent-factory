import type { StreamEvent } from '../contract/index.ts';
import { ACTIVITY_ENTRIES_KEPT } from './state.ts';

/** Merges activity feeds into one, newest first, with each event kept once. */
export function mergeActivity(...feeds: readonly (readonly StreamEvent[])[]): readonly StreamEvent[] {
  const bySequence = new Map<number, StreamEvent>();
  for (const feed of feeds) {
    for (const event of feed) bySequence.set(event.sequence, event);
  }
  return [...bySequence.values()].sort((left, right) => right.sequence - left.sequence).slice(0, ACTIVITY_ENTRIES_KEPT);
}
