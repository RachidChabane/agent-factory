import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DeliveredCommit } from '../../contract/index.ts';
import { clock, environmentCard, LEDGER, openDelivery, panelOf, STOREFRONT, withEnvironment } from './delivery-test-support.ts';

const DELIVERED: DeliveredCommit = {
  sha: 'd'.repeat(40),
  headline: 'feat(orders): paginate the order history endpoint (#44)',
  author: 'Example Factory',
  committedAt: clock.minutesAgo(60),
  pullRequestNumber: 44,
  issueNumber: 41,
};
const DIRECT: DeliveredCommit = { sha: 'e'.repeat(40), headline: 'docs: describe the cart rounding', author: 'Riley Chen', committedAt: clock.minutesAgo(90), pullRequestNumber: null, issueNumber: null };

function deployments(environment: string) {
  return panelOf(environmentCard(environment), 'Deployments');
}

/** The snapshot where the current deployment of an environment brought these commits and these wait behind it. */
function withDeliveries(name: string, changes: readonly DeliveredCommit[] | null, pending: readonly DeliveredCommit[] | null) {
  return withEnvironment(STOREFRONT, name, (environment) => {
    const reading = environment.deployments;
    const value = reading?.value;
    if (reading === null || value === null || value === undefined || value.current === null) return environment;
    const current = { ...value.current, changes: changes === null ? null : [...changes] };
    const history = value.history.map((entry) => (entry.id === current.id ? current : entry));
    return { ...environment, deployments: { ...reading, value: { current, history, pending: pending === null ? null : [...pending] } } };
  });
}

/** The part of the current deployment that tells which commits it delivered. */
function deliveredBlock(environment: string): HTMLElement {
  const block = within(deployments(environment)).getByText('Commits delivered').parentElement;
  if (block === null) throw new Error('the delivered commits have no block');
  return block;
}

describe('DeliveryView delivered commits', () => {
  it('lists the commits the current deployment brought, linked to their pull request and issue, and the ones nobody opened a pull request for', async () => {
    await openDelivery(STOREFRONT, { snapshot: withDeliveries('staging', [DELIVERED, DIRECT], []) });
    const current = deliveredBlock('staging');
    const pullRequest = within(current).getByRole('link', { name: DELIVERED.headline });
    expect(pullRequest).toHaveAttribute('href', '/projects/storefront/pull-requests/44');
    expect(within(current).getByRole('link', { name: 'Issue #41' })).toHaveAttribute('href', '/projects/storefront/issues/41');
    expect(within(current).getByText(DIRECT.headline).closest('a')).toBeNull();
    expect(within(current).getByText('Riley Chen')).toBeInTheDocument();
  });

  it('says that a deployment brought no new commit, and that the commits of one are unknown, which are not the same', async () => {
    await openDelivery(STOREFRONT, { snapshot: withDeliveries('staging', [], []) });
    expect(within(deliveredBlock('staging')).getByText('No new commit')).toBeInTheDocument();
    expect(within(deliveredBlock('staging')).queryByText(/The commits are unknown/)).not.toBeInTheDocument();
  });

  it('says that the commits are unknown when the clone cannot name them', async () => {
    await openDelivery(STOREFRONT, { snapshot: withDeliveries('staging', null, []) });
    expect(within(deliveredBlock('staging')).getByText(/The commits are unknown: the clone of the project does not hold this deployment/)).toBeInTheDocument();
  });

  it('folds the commits of each deployment of the history behind their count', async () => {
    await openDelivery();
    const table = within(deployments('staging')).getByRole('table', { name: 'Deployment history of staging' });
    expect(within(table).getByRole('columnheader', { name: 'Commits' })).toBeInTheDocument();
    expect(within(table).getAllByText('2 commits').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('1 commit').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('No new commit').length).toBeGreaterThan(0);
    const unknown = within(table).getAllByText('Commits unknown');
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown[0]).toHaveAttribute('title', expect.stringMatching(/the clone of the project does not hold this deployment/));
  });

  it('lists the commits that wait for the environment, with the base branch they come from', async () => {
    await openDelivery(STOREFRONT, { snapshot: withDeliveries('staging', [], [DELIVERED, DIRECT]) });
    const waiting = within(deployments('staging')).getByRole('group', { name: 'Waiting for this environment' });
    expect(within(waiting).getByText('2 commits of main are not deployed here yet')).toBeInTheDocument();
    expect(within(waiting).getByRole('link', { name: DELIVERED.headline })).toBeInTheDocument();
  });

  it('says that nothing waits when the environment runs the head of the base branch, and that it is unknown when the clone cannot say', async () => {
    await openDelivery(STOREFRONT, { snapshot: withDeliveries('staging', [], []) });
    expect(within(deployments('staging')).getByText('Nothing is waiting: this environment runs the head of main')).toBeInTheDocument();
  });

  it('says that the waiting commits are unknown when the clone cannot say', async () => {
    await openDelivery(STOREFRONT, { snapshot: withDeliveries('staging', [], null) });
    expect(within(deployments('staging')).getByText(/The commits waiting are unknown: the clone of the project does not hold the deployed commit or the head of main/)).toBeInTheDocument();
  });

  it('shows no waiting commits for an environment where nothing is deployed', async () => {
    await openDelivery(LEDGER);
    expect(within(environmentCard('production')).queryByRole('group', { name: 'Waiting for this environment' })).not.toBeInTheDocument();
  });

  it('is written in French on a French page', async () => {
    await openDelivery(STOREFRONT, { snapshot: withDeliveries('staging', [DELIVERED], [DELIVERED, DIRECT]), locale: 'fr' });
    expect(screen.getAllByText('Commits livrés').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('group', { name: 'En attente pour cet environnement' }).length).toBeGreaterThan(0);
    expect(screen.getByText('2 commits de main ne sont pas encore déployés ici')).toBeInTheDocument();
  });
});
