import type { CockpitSnapshot } from '../../packages/cockpit/src/contract/index.ts';
import { projectOf } from './api.ts';
import { LEDGER, STOREFRONT } from './story.ts';

/** The story has been played and the factory has caught up with it: audits, release and pull requests are in, an agent waits for a decision. */
export function demoIsSettled(state: CockpitSnapshot): boolean {
  const storefront = projectOf(state, STOREFRONT);
  const ledger = projectOf(state, LEDGER);
  const openAndReady = (pullRequests: readonly { state: string; mergeable: boolean }[]): boolean => pullRequests.filter((pull) => pull.state === 'open').every((pull) => pull.mergeable);
  return (
    storefront.audits.length > 0 &&
    storefront.skippedChanges.length > 0 &&
    storefront.releases.length > 0 &&
    storefront.pullRequests.some((pull) => pull.state === 'open') &&
    openAndReady(storefront.pullRequests) &&
    openAndReady(ledger.pullRequests) &&
    state.runs.some((run) => run.status === 'waiting')
  );
}
