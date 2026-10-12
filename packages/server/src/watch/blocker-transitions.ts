import type { Blocker } from './blocker.ts';

export const TRANSITION_KINDS = ['appeared', 'cleared'] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export interface BlockerTransition {
  readonly kind: TransitionKind;
  readonly blocker: Blocker;
}

/**
 * What changed between two readings: the blockers that cleared, then the ones that appeared, each
 * in the order its reading lists them. A blocker that stayed, whatever its detail now says, is no change.
 */
export function diffBlockers(previous: readonly Blocker[], next: readonly Blocker[]): readonly BlockerTransition[] {
  const before = new Set(previous.map((blocker) => blocker.key));
  const after = new Set(next.map((blocker) => blocker.key));
  return [
    ...previous.filter((blocker) => !after.has(blocker.key)).map((blocker): BlockerTransition => ({ kind: 'cleared', blocker })),
    ...next.filter((blocker) => !before.has(blocker.key)).map((blocker): BlockerTransition => ({ kind: 'appeared', blocker })),
  ];
}
