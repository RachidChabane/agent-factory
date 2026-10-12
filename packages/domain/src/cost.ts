/**
 * What a dollar figure of an agent run means. Under a Claude subscription the CLI reports the
 * price the same tokens would have cost on the API: an equivalent, not a charge.
 */
export const COST_BASES = ['subscription-equivalent', 'metered'] as const;
export type CostBasis = (typeof COST_BASES)[number];

export const BILLING_MODES = ['subscription', 'api-key'] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

export const DEFAULT_BILLING_MODE: BillingMode = 'subscription';

export function costBasisOf(billing: BillingMode): CostBasis {
  return billing === 'subscription' ? 'subscription-equivalent' : 'metered';
}
