/**
 * Why the factory stops starting new work: short machine resources, a spent budget, the
 * operator's order, or a drain the operator asked for so the factory stops once its running work
 * finishes, for a restart that cuts no agent short.
 */
export const PAUSE_CAUSES = ['resources', 'budget', 'operator', 'drain'] as const;
export type PauseCause = (typeof PAUSE_CAUSES)[number];
