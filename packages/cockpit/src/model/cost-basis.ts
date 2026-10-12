import type { BillingMode } from '@agent-factory/domain';
import { costBasisOf } from '@agent-factory/domain';
import type { CockpitSnapshot, CostBasisView, RunView } from '../contract/index.ts';

export function costBasisOfBilling(billing: BillingMode): CostBasisView {
  return costBasisOf(billing);
}

/**
 * What the dollar figure of a run means: it follows the billing of the account that ran it, and the
 * installation's overall basis when the account is unknown.
 */
export function costBasisOfRun(snapshot: Pick<CockpitSnapshot, 'usage' | 'costs'>, run: Pick<RunView, 'account'>): CostBasisView {
  const account = snapshot.usage.accounts.find((candidate) => candidate.name === run.account);
  return account === undefined ? snapshot.costs.basis : costBasisOfBilling(account.billing);
}
