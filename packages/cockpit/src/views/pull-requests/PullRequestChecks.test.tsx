import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CheckRunView, PullRequestView } from '../../contract/index.ts';
import { PULL_REQUEST as LEDGER_PULL_REQUEST } from '../../test/fixtures/ledger/ids.ts';
import { PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { LEDGER, minutesAgo, openPullRequest, STOREFRONT, withPullRequest } from './pull-request-test-support.ts';

const SEARCH = PULL_REQUEST.naturalLanguageSearch;
const RATE_LIMIT = 'GitHub API rate limit exceeded; the next attempt is allowed in 12 minutes.';

const region = () => screen.getByRole('region', { name: 'Checks' });
const table = () => within(region()).getByRole('table', { name: 'Checks of the head commit' });
const rowOf = (name: string) => within(table()).getByText(name).closest('tr') as HTMLElement;
const withChecks = (checks: PullRequestView['checks'], number = SEARCH) => withPullRequest(STOREFRONT, number, (pullRequest) => ({ ...pullRequest, checks }));
const run = (name: string, conclusion: CheckRunView['conclusion'], durationMs: number | null, failsOnBase = false): CheckRunView => ({
  name,
  conclusion,
  durationMs,
  failsOnBase,
  url: `https://github.example.com/example-org/storefront/pull/57/checks?check=${name}`,
});

describe('PullRequestsView checks, freshly read', () => {
  it('lists the check runs of the head commit with their result and how long they took', async () => {
    await openPullRequest(SEARCH);
    expect(within(table()).getAllByRole('columnheader').map((heading) => heading.textContent)).toEqual(['Check', 'Result', 'Duration', 'Check run']);
    expect(within(rowOf('build')).getByText('Passed')).toBeInTheDocument();
    expect(within(rowOf('build')).getByText('1 min 11 sec')).toBeInTheDocument();
    expect(within(rowOf('e2e-search')).getByText('3 min 23 sec')).toBeInTheDocument();
    expect(within(table()).getAllByRole('row')).toHaveLength(6);
  });

  it('says that a check run reports no duration, and calls a neutral check neutral', async () => {
    await openPullRequest(SEARCH);
    expect(within(rowOf('deploy-preview')).getByText('Neutral')).toBeInTheDocument();
    expect(within(rowOf('deploy-preview')).getByText('Not reported')).toBeInTheDocument();
  });

  it('links each check run to the forge, in a new tab', async () => {
    await openPullRequest(SEARCH);
    const link = within(rowOf('lint')).getByRole('link', { name: 'Open the check run lint' });
    expect(link).toHaveAttribute('href', 'https://github.example.com/example-org/storefront/pull/57/checks?check=lint');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('says when the checks were read, and does not call a fresh reading stale', async () => {
    await openPullRequest(SEARCH);
    const age = within(region()).getByText(/^Read 3 min/);
    expect(age).toHaveAttribute('datetime', minutesAgo(3));
    expect(within(region()).queryByText('Stale')).not.toBeInTheDocument();
    expect(within(region()).queryByRole('note')).not.toBeInTheDocument();
  });

  it('says in plain sight that a failing check also fails on the base branch, and not for the failure the change caused', async () => {
    const checks = { value: [run('build', 'success', 1000), run('e2e', 'failure', 2000, true), run('lint', 'failure', 3000)], readAt: minutesAgo(2), error: null };
    await openPullRequest(SEARCH, { snapshot: withChecks(checks) });
    expect(within(rowOf('e2e')).getByText('also fails on the base branch — not caused by this change')).toBeInTheDocument();
    expect(within(rowOf('e2e')).getByText('Failed')).toBeInTheDocument();
    expect(within(rowOf('lint')).getByText('Failed')).toBeInTheDocument();
    expect(within(rowOf('lint')).queryByText(/also fails on the base branch/)).not.toBeInTheDocument();
    expect(within(rowOf('build')).queryByText(/also fails on the base branch/)).not.toBeInTheDocument();
    expect(within(table()).getAllByText('also fails on the base branch — not caused by this change')).toHaveLength(1);
  });

  it('does not say that a check which did not fail also fails on the base', async () => {
    const checks = { value: [run('build', 'success', 1000, true)], readAt: minutesAgo(2), error: null };
    await openPullRequest(SEARCH, { snapshot: withChecks(checks) });
    expect(within(rowOf('build')).queryByText(/also fails on the base branch/)).not.toBeInTheDocument();
  });

  it('shows the failure the base branch shares next to the one the change caused', async () => {
    await openPullRequest(PULL_REQUEST.expiredPromoMessage);
    expect(within(rowOf('docs-links')).getByText('Failed')).toBeInTheDocument();
    expect(within(rowOf('docs-links')).getByText('also fails on the base branch — not caused by this change')).toBeInTheDocument();
    expect(within(rowOf('e2e-checkout')).getByText('Failed')).toBeInTheDocument();
    expect(within(rowOf('e2e-checkout')).queryByText(/also fails on the base branch/)).not.toBeInTheDocument();
  });

  it('opens the log of a check of a local forge, served by the API, in a new tab like any other link', async () => {
    const checks = { value: [{ ...run('local-rehearsal', 'success', null), url: '/api/projects/ledger/forge/checks/0b9fa09.log' }], readAt: minutesAgo(3), error: null };
    await openPullRequest(LEDGER_PULL_REQUEST.webhookSignatures, { snapshot: withPullRequest(LEDGER, LEDGER_PULL_REQUEST.webhookSignatures, (pullRequest) => ({ ...pullRequest, checks })) }, LEDGER);
    const link = within(table()).getByRole('link', { name: 'Open the check run local-rehearsal' });
    expect(link).toHaveAttribute('href', '/api/projects/ledger/forge/checks/0b9fa09.log');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('shows a failing and a pending check for what they are', async () => {
    await openPullRequest(PULL_REQUEST.expiredPromoMessage);
    expect(within(rowOf('e2e-checkout')).getByText('Failed')).toBeInTheDocument();
    expect(within(rowOf('deploy-preview')).getByText('Pending')).toBeInTheDocument();
  });
});

describe('PullRequestsView checks, in the states of a reading', () => {
  it('keeps showing the checks a failed read left, marks them stale and spells out the error beside them', async () => {
    await openPullRequest(PULL_REQUEST.checkoutScreenReader);
    expect(within(table()).getAllByRole('row')).toHaveLength(5);
    expect(within(rowOf('e2e-checkout')).getByText('Pending')).toBeInTheDocument();
    expect(within(region()).getByText(/^Read 40 min/)).toHaveAttribute('datetime', minutesAgo(40));
    expect(within(region()).getByText('Stale')).toBeInTheDocument();
    expect(within(region()).getByRole('note')).toHaveTextContent(`The last read failed (${RATE_LIMIT}). This is the value read 40 min. ago.`);
  });

  it('says that the checks of a pull request that was never read have not been read', async () => {
    await openPullRequest(PULL_REQUEST.legacyDateHelpers);
    expect(within(region()).getByText('The checks of this pull request were never read from the forge')).toBeInTheDocument();
    expect(within(region()).queryByRole('table')).not.toBeInTheDocument();
  });

  it('says that the checks of an open pull request have not been read yet', async () => {
    await openPullRequest(SEARCH, { snapshot: withChecks({ value: null, readAt: null, error: null }) });
    expect(within(region()).getByText('The checks of this pull request have not been read from the forge yet')).toBeInTheDocument();
    expect(within(region()).queryByRole('table')).not.toBeInTheDocument();
  });

  it('says that the checks could not be read, and why, when nothing was kept', async () => {
    await openPullRequest(SEARCH, { snapshot: withChecks({ value: null, readAt: null, error: 'connection reset by the forge' }) });
    expect(within(region()).getByText('Could not be read')).toBeInTheDocument();
    expect(within(region()).getByText('connection reset by the forge')).toBeInTheDocument();
    expect(within(region()).queryByRole('table')).not.toBeInTheDocument();
  });

  it('says that the forge reports no check run when the reading succeeded and is empty', async () => {
    await openPullRequest(SEARCH, { snapshot: withChecks({ value: [], readAt: minutesAgo(5), error: null }) });
    expect(within(region()).getByText('The forge reports no check run for this pull request')).toBeInTheDocument();
    expect(within(region()).getByText(/^Read 5 min/)).toBeInTheDocument();
    expect(within(region()).queryByRole('table')).not.toBeInTheDocument();
  });

  it('leaves out the column of durations when the forge reports none', async () => {
    const checks = { value: [run('build', 'success', null), run('lint', 'failure', null)], readAt: minutesAgo(2), error: null };
    await openPullRequest(SEARCH, { snapshot: withChecks(checks) });
    expect(within(table()).getAllByRole('columnheader').map((heading) => heading.textContent)).toEqual(['Check', 'Result', 'Check run']);
    expect(screen.queryByText('Not reported')).not.toBeInTheDocument();
  });

  it('keeps the column of durations when only one check run reports one, and says which report none', async () => {
    const checks = { value: [run('build', 'success', 71_000), run('lint', 'success', null), run('deploy', 'pending', null)], readAt: minutesAgo(2), error: null };
    await openPullRequest(SEARCH, { snapshot: withChecks(checks) });
    expect(within(table()).getAllByRole('columnheader').map((heading) => heading.textContent)).toEqual(['Check', 'Result', 'Duration', 'Check run']);
    expect(within(rowOf('build')).getByText('1 min 11 sec')).toBeInTheDocument();
    expect(within(rowOf('lint')).getByText('Not reported')).toBeInTheDocument();
    expect(within(rowOf('deploy')).getByText('Not reported')).toBeInTheDocument();
  });

  it('keeps two check runs of the same name apart', async () => {
    const checks = { value: [run('e2e', 'success', 1000), run('e2e', 'failure', 2000)], readAt: minutesAgo(2), error: null };
    await openPullRequest(SEARCH, { snapshot: withChecks(checks) });
    expect(within(table()).getAllByText('e2e')).toHaveLength(2);
    expect(within(table()).getAllByRole('link', { name: 'Open the check run e2e' })).toHaveLength(2);
  });

  it('says that a check run has no link when the forge gives none', async () => {
    await openPullRequest(LEDGER_PULL_REQUEST.webhookSignatures, {}, LEDGER);
    const row = within(table()).getByText('local-rehearsal').closest('tr') as HTMLElement;
    expect(within(row).getByText('No link')).toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row).getByText('Passed')).toBeInTheDocument();
  });
});

describe('PullRequestsView checks in French', () => {
  it('words the table, the results and the durations in French', async () => {
    await openPullRequest(SEARCH, { locale: 'fr' });
    const frenchTable = within(screen.getByRole('region', { name: 'Checks' })).getByRole('table', { name: 'Checks du commit de tête' });
    expect(within(frenchTable).getAllByRole('columnheader').map((heading) => heading.textContent)).toEqual(['Check', 'Résultat', 'Durée', 'Exécution']);
    expect(within(frenchTable).getAllByText('Réussi')).toHaveLength(4);
    expect(within(frenchTable).getByText('1 min 11 s')).toBeInTheDocument();
    expect(within(frenchTable).getByText('Non communiquée')).toBeInTheDocument();
    expect(within(frenchTable).getByRole('link', { name: 'Ouvrir l’exécution du check build' })).toBeInTheDocument();
  });

  it('says in French that a failing check also fails on the base branch', async () => {
    const checks = { value: [run('e2e', 'failure', 2000, true)], readAt: minutesAgo(2), error: null };
    await openPullRequest(SEARCH, { locale: 'fr', snapshot: withChecks(checks) });
    const row = within(screen.getByRole('table', { name: 'Checks du commit de tête' })).getByText('e2e').closest('tr') as HTMLElement;
    expect(within(row).getByText('échoue aussi sur la branche de base — pas causé par ce changement')).toBeInTheDocument();
  });

  it('words the stale reading and its error in French', async () => {
    await openPullRequest(PULL_REQUEST.checkoutScreenReader, { locale: 'fr' });
    const checks = screen.getByRole('region', { name: 'Checks' });
    expect(within(checks).getByText('Périmé')).toBeInTheDocument();
    expect(within(checks).getByRole('note')).toHaveTextContent('Le dernier relevé a échoué');
  });

  it('says in French that the checks were never read', async () => {
    await openPullRequest(PULL_REQUEST.legacyDateHelpers, { locale: 'fr' });
    expect(screen.getByText('Les checks de cette pull request n’ont jamais été relevés sur la forge')).toBeInTheDocument();
  });
});
