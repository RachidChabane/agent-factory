import { defineLifecycle } from './lifecycle.ts';

export const AUDIT_STATES = ['detected', 'auditing', 'keep', 'challenge', 'rewrite'] as const;
export type AuditState = (typeof AUDIT_STATES)[number];

export const AUDIT_INITIAL_STATE: AuditState = 'detected';

export const auditLifecycle = defineLifecycle<AuditState>({
  name: 'audit',
  states: AUDIT_STATES,
  initial: AUDIT_INITIAL_STATE,
  transitions: {
    detected: ['auditing'],
    auditing: ['keep', 'challenge', 'rewrite'],
    keep: [],
    challenge: [],
    rewrite: [],
  },
});

export const canTransitionAudit = auditLifecycle.canTransition;
export const assertAuditTransition = auditLifecycle.assertTransition;
