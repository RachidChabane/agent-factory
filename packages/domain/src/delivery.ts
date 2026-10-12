/**
 * How a merged change reaches each environment of a project: on its own after every merge,
 * in a release batch the operator cuts, or only when the operator runs the deployment.
 */
export const PROMOTION_POLICIES = ['automatic', 'batch', 'manual'] as const;
export type PromotionPolicy = (typeof PROMOTION_POLICIES)[number];

/** How a project marks releases: release-please pull requests, plain tags, or not at all. */
export const RELEASE_MODEL_KINDS = ['release-please', 'tags', 'none'] as const;
export type ReleaseModelKind = (typeof RELEASE_MODEL_KINDS)[number];
