import type { BlockerDetector } from '../blocker.ts';
import { decisionPendingDetector } from './decision-pending.ts';
import { filmFailedDetector } from './film-failed.ts';
import { needsHumanDetector } from './needs-human.ts';
import { noFreeWorktreeDetector } from './no-free-worktree.ts';
import { pausedDetector } from './paused.ts';
import { runFailedDetector } from './run-failed.ts';
import { stalledDetector } from './stalled.ts';

/** Every kind of blocker the snapshot can show, in the order the report lists them. */
export const BLOCKER_DETECTORS: readonly BlockerDetector[] = [
  needsHumanDetector,
  decisionPendingDetector,
  runFailedDetector,
  stalledDetector,
  pausedDetector,
  noFreeWorktreeDetector,
  filmFailedDetector,
];
