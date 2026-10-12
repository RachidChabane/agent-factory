import { MILLISECONDS_PER_MINUTE } from './time-units.ts';
import type { WatchedSnapshot } from './watched-snapshot.ts';

/**
 * The kinds of blocker `agent-factory watch` reports. A kind has one detector in the registry;
 * a new kind adds its name here and its detector there.
 */
export const BLOCKER_KINDS = {
  needsHuman: 'needs-human',
  decisionPending: 'decision-pending',
  runFailed: 'run-failed',
  stalled: 'stalled',
  paused: 'paused',
  noFreeWorktree: 'no-free-worktree',
  filmFailed: 'film-failed',
  cockpitUnreachable: 'cockpit-unreachable',
} as const;
export type BlockerKind = (typeof BLOCKER_KINDS)[keyof typeof BLOCKER_KINDS];

const KEY_SEPARATOR = '|';

/** One thing that blocks work, identified by its key: the same blocker has the same key at every reading. */
export interface Blocker {
  readonly key: string;
  readonly kind: BlockerKind;
  /** The project it concerns; null for the whole factory. */
  readonly project: string | null;
  /** The issue it concerns, when it concerns one. */
  readonly issue: number | null;
  /** One line, without the time. */
  readonly detail: string;
}

/** A key made of the kind and the facts that tell one blocker of that kind from another. */
export function blockerKey(kind: BlockerKind, ...identity: readonly (string | number)[]): string {
  return [kind, ...identity].join(KEY_SEPARATOR);
}

/** A pause shorter than this is the factory working as intended. */
export const PAUSE_REPORTED_AFTER_MINUTES = 10;
/** An issue in a stage that owes an agent run, with no run for this long, is stalled. */
export const ISSUE_SILENT_AFTER_MINUTES = 10;
/** A failed run is reported for this long after it ended, unless the subject runs again first. */
export const FAILED_RUN_REPORTED_FOR_MINUTES = 60;

export interface BlockerThresholds {
  readonly pauseMs: number;
  readonly silenceMs: number;
  readonly failedRunWindowMs: number;
}

export const DEFAULT_BLOCKER_THRESHOLDS: BlockerThresholds = {
  pauseMs: PAUSE_REPORTED_AFTER_MINUTES * MILLISECONDS_PER_MINUTE,
  silenceMs: ISSUE_SILENT_AFTER_MINUTES * MILLISECONDS_PER_MINUTE,
  failedRunWindowMs: FAILED_RUN_REPORTED_FOR_MINUTES * MILLISECONDS_PER_MINUTE,
};

export interface DetectionContext {
  readonly now: Date;
  readonly thresholds: BlockerThresholds;
}

/** The strategy for one kind of blocker: what in a snapshot blocks work of that kind. */
export interface BlockerDetector {
  readonly kind: BlockerKind;
  detect(snapshot: WatchedSnapshot, context: DetectionContext): readonly Blocker[];
}
