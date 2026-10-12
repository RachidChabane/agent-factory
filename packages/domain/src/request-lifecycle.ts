import { defineLifecycle } from './lifecycle.ts';

export const REQUEST_STATES = [
  'received',
  'challenging',
  'challenged',
  'accepted',
  'declined',
  'waiting-requester',
] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

export const REQUEST_INITIAL_STATE: RequestState = 'received';

export const requestLifecycle = defineLifecycle<RequestState>({
  name: 'request',
  states: REQUEST_STATES,
  initial: REQUEST_INITIAL_STATE,
  transitions: {
    received: ['challenging'],
    challenging: ['challenged'],
    challenged: ['accepted', 'declined', 'waiting-requester'],
    'waiting-requester': ['challenging'],
    accepted: [],
    declined: [],
  },
});

export const canTransitionRequest = requestLifecycle.canTransition;
export const assertRequestTransition = requestLifecycle.assertTransition;
