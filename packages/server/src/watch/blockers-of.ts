import { DEFAULT_BLOCKER_THRESHOLDS, type Blocker, type BlockerDetector, type BlockerThresholds } from './blocker.ts';
import { BLOCKER_DETECTORS } from './detectors/registry.ts';
import type { WatchedSnapshot } from './watched-snapshot.ts';

/** What blocks work in a snapshot read at `now`: the blockers of every detector, one per key. */
export function blockersOf(
  snapshot: WatchedSnapshot,
  now: Date,
  thresholds: BlockerThresholds = DEFAULT_BLOCKER_THRESHOLDS,
  detectors: readonly BlockerDetector[] = BLOCKER_DETECTORS,
): readonly Blocker[] {
  const byKey = new Map<string, Blocker>();
  for (const detector of detectors) {
    for (const blocker of detector.detect(snapshot, { now, thresholds })) {
      if (!byKey.has(blocker.key)) byKey.set(blocker.key, blocker);
    }
  }
  return [...byKey.values()];
}
