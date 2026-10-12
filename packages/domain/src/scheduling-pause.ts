/** Why the factory stops starting new work: short machine resources, a spent budget, or the operator's order. */
export const PAUSE_CAUSES = ['resources', 'budget', 'operator'] as const;
export type PauseCause = (typeof PAUSE_CAUSES)[number];
