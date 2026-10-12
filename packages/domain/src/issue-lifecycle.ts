import type { IssueState } from './model.ts';
import { ISSUE_STATES } from './model.ts';
import { defineLifecycle, InvalidTransitionError } from './lifecycle.ts';

export const ISSUE_INITIAL_STATE: IssueState = 'spec-draft';
export const ISSUE_TERMINAL_STATE: IssueState = 'closed';
export const ISSUE_ESCALATION_STATE: IssueState = 'needs-human';
export const ISSUE_ABANDONED_STATE: IssueState = 'abandoned';
export const ISSUE_FINAL_STATES: readonly IssueState[] = [ISSUE_TERMINAL_STATE, ISSUE_ABANDONED_STATE];
export const ISSUE_CHECK_REWRITE_STATE: IssueState = 'rewriting-check';
export const CHECK_REWRITABLE_STATES: readonly IssueState[] = [
  'checks-frozen',
  'implementing',
  'gating',
  'reviewing',
  'producing-evidence',
  'pr-open',
  'ci',
  'ready-to-merge',
];

const FORWARD_TRANSITIONS: Readonly<Record<IssueState, readonly IssueState[]>> = {
  'spec-draft': ['spec-validated'],
  'spec-validated': ['blocked', 'authoring-checks'],
  blocked: ['spec-validated'],
  'authoring-checks': ['checks-frozen'],
  'checks-frozen': ['implementing', 'rewriting-check'],
  'rewriting-check': ['checks-frozen'],
  implementing: ['gating', 'rewriting-check'],
  gating: ['implementing', 'reviewing', 'rewriting-check'],
  reviewing: ['implementing', 'producing-evidence', 'rewriting-check'],
  'producing-evidence': ['pr-open', 'rewriting-check'],
  'pr-open': ['ci', 'rewriting-check'],
  ci: ['implementing', 'ready-to-merge', 'rewriting-check'],
  'ready-to-merge': ['merged', 'rewriting-check'],
  merged: ['in-dev'],
  'in-dev': ['in-release'],
  'in-release': ['in-prep'],
  'in-prep': ['in-prod'],
  'in-prod': ['closed'],
  closed: [],
  abandoned: [],
  'needs-human': [],
};

function isInFlight(state: IssueState): boolean {
  return state !== ISSUE_ESCALATION_STATE && !ISSUE_FINAL_STATES.includes(state);
}

const RESUMABLE_STATES: readonly IssueState[] = ISSUE_STATES.filter(isInFlight);

function buildIssueTransitions(): Record<IssueState, readonly IssueState[]> {
  const table: Record<IssueState, readonly IssueState[]> = {
    ...FORWARD_TRANSITIONS,
    [ISSUE_ESCALATION_STATE]: [...RESUMABLE_STATES, ISSUE_ABANDONED_STATE],
  };
  for (const state of ISSUE_STATES.filter(isInFlight)) {
    table[state] = [...FORWARD_TRANSITIONS[state], ISSUE_ESCALATION_STATE];
  }
  return table;
}

export const issueLifecycle = defineLifecycle<IssueState>({
  name: 'issue',
  states: ISSUE_STATES,
  initial: ISSUE_INITIAL_STATE,
  transitions: buildIssueTransitions(),
});

export const canTransition = issueLifecycle.canTransition;
export const assertTransition = issueLifecycle.assertTransition;

export function isCheckRewriteExit(recordedBeforeEscalation: IssueState, to: IssueState): boolean {
  return to === ISSUE_CHECK_REWRITE_STATE && [...CHECK_REWRITABLE_STATES, ISSUE_CHECK_REWRITE_STATE].includes(recordedBeforeEscalation);
}

export function assertResumeTarget(recordedBeforeEscalation: IssueState, to: IssueState): void {
  if (to !== recordedBeforeEscalation && to !== ISSUE_ABANDONED_STATE && !isCheckRewriteExit(recordedBeforeEscalation, to)) {
    throw new InvalidTransitionError('issue-resume', ISSUE_ESCALATION_STATE, to);
  }
}
