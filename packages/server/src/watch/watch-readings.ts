import { BLOCKER_KINDS, blockerKey, DEFAULT_BLOCKER_THRESHOLDS, type Blocker, type BlockerThresholds } from './blocker.ts';
import { blockersOf } from './blockers-of.ts';
import type { WatchedSnapshot } from './watched-snapshot.ts';

/** What one poll of the factory gave. */
export type Reading =
  | { readonly kind: 'snapshot'; readonly at: Date; readonly snapshot: WatchedSnapshot }
  | { readonly kind: 'unreachable'; readonly at: Date; readonly reason: string };

export function unreachableBlocker(reason: string): Blocker {
  return { key: blockerKey(BLOCKER_KINDS.cockpitUnreachable), kind: BLOCKER_KINDS.cockpitUnreachable, project: null, issue: null, detail: reason };
}

/**
 * The blockers after a reading. A snapshot gives the blockers it shows. While the factory cannot be
 * read, what was known stays as it was and only the unreachable blocker is added, first: nothing is known
 * to have cleared, and nothing appears again when the factory answers.
 */
export function blockersAfter(previous: readonly Blocker[], reading: Reading, thresholds: BlockerThresholds = DEFAULT_BLOCKER_THRESHOLDS): readonly Blocker[] {
  if (reading.kind === 'snapshot') return blockersOf(reading.snapshot, reading.at, thresholds);
  const known = previous.filter((blocker) => blocker.kind !== BLOCKER_KINDS.cockpitUnreachable);
  return [unreachableBlocker(reading.reason), ...known];
}
