import { defineLifecycle } from './lifecycle.ts';

export const RELEASE_STATES = ['open', 'cut', 'auditing', 'blocked', 'promotable', 'promoted', 'verified'] as const;
export type ReleaseState = (typeof RELEASE_STATES)[number];

export const RELEASE_INITIAL_STATE: ReleaseState = 'open';

export const releaseLifecycle = defineLifecycle<ReleaseState>({
  name: 'release',
  states: RELEASE_STATES,
  initial: RELEASE_INITIAL_STATE,
  transitions: {
    open: ['cut'],
    cut: ['auditing'],
    auditing: ['blocked', 'promotable'],
    blocked: ['auditing'],
    promotable: ['blocked', 'promoted'],
    promoted: ['verified'],
    verified: [],
  },
});

export const canTransitionRelease = releaseLifecycle.canTransition;
export const assertReleaseTransition = releaseLifecycle.assertTransition;
