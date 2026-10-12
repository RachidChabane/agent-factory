import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { PULL_REQUEST as LEDGER_PULL_REQUEST } from '../../test/fixtures/ledger/ids.ts';
import { PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { fixtureSnapshot, renderRoute } from '../../test/render.tsx';
import { LEDGER, minutesAgo, openPullRequest, pullRequestsPath, SEARCH_TITLE, STOREFRONT, withPullRequest } from './pull-request-test-support.ts';

const CHECKOUT_TITLE = 'feat(checkout): announce the errors of the address form to assistive technology';
const WEBHOOK_TITLE = 'fix(webhooks): verify webhook signatures with a rotating secret';
const HTTP_CLIENT_TITLE = 'build(deps): update the HTTP client to its latest minor release';

const hrefsIn = (region: HTMLElement) => within(region).getAllByRole('link').map((link) => link.getAttribute('href'));
const linkTo = (project: string, number: number) => `/projects/${project}/pull-requests/${number}`;
const exactly = (text: string) => new RegExp(text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const titleLink = (title: string) => screen.getByRole('link', { name: exactly(title) });

describe('PullRequestsView list', () => {
  it('groups the pull requests as open, merged and closed, with the one that can be merged on top', async () => {
    await renderRoute(pullRequestsPath(STOREFRONT));
    const open = await screen.findByRole('region', { name: 'Open' });
    expect(hrefsIn(open)).toEqual([57, 62, 60].map((number) => linkTo(STOREFRONT, number)));
    expect(hrefsIn(screen.getByRole('region', { name: 'Merged' }))).toEqual([44, 39, 34, 29, 27, 22, 14].map((number) => linkTo(STOREFRONT, number)));
    expect(hrefsIn(screen.getByRole('region', { name: 'Closed' }))).toEqual([linkTo(STOREFRONT, 80)]);
  });

  it('counts the pull requests of the project in the title of the list', async () => {
    await renderRoute(pullRequestsPath(STOREFRONT));
    expect(await screen.findByRole('heading', { level: 1, name: /^Pull requests\s*11$/ })).toBeInTheDocument();
  });

  it('shows for each pull request its number, its issue and its state', async () => {
    await renderRoute(pullRequestsPath(STOREFRONT));
    const link = within(await screen.findByRole('region', { name: 'Open' })).getByRole('link', { name: exactly(SEARCH_TITLE) });
    expect(within(link).getByText('#57')).toBeInTheDocument();
    expect(within(link).getByText('Issue #52')).toBeInTheDocument();
    expect(within(link).getByRole('img', { name: 'Open' })).toBeInTheDocument();
    const merged = within(screen.getByRole('region', { name: 'Merged' })).getAllByRole('link')[0];
    expect(within(merged as HTMLElement).getByRole('img', { name: 'Merged' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Closed' })).getByRole('img', { name: 'Closed' })).toBeInTheDocument();
  });

  it('flags the pull requests that can be merged, and only those', async () => {
    await renderRoute(pullRequestsPath(STOREFRONT));
    const open = await screen.findByRole('region', { name: 'Open' });
    expect(within(open).getAllByText('Ready to merge')).toHaveLength(1);
    expect(within(within(open).getByRole('link', { name: exactly(SEARCH_TITLE) })).getByText('Ready to merge')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Merged' })).queryByText('Ready to merge')).not.toBeInTheDocument();
  });

  it('summarises the checks when the reading holds a value, even a stale one, and shows nothing when it holds none', async () => {
    await renderRoute(pullRequestsPath(STOREFRONT));
    const open = await screen.findByRole('region', { name: 'Open' });
    expect(within(within(open).getByRole('link', { name: exactly(SEARCH_TITLE) })).getByRole('img', { name: 'Checks passing · 4 of 5 checks passed' })).toBeInTheDocument();
    expect(within(within(open).getByRole('link', { name: exactly('tell customers when a promo code has expired') })).getByRole('img', { name: 'Checks failing · 3 of 6 checks passed' })).toBeInTheDocument();
    expect(within(within(open).getByRole('link', { name: exactly(CHECKOUT_TITLE) })).getByRole('img', { name: 'Checks running · 3 of 4 checks passed' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Merged' })).queryByRole('img', { name: /checks? passed/ })).not.toBeInTheDocument();
  });

  it('marks a reading that holds no check as such, and a reading that holds nothing not at all', async () => {
    const empty = withPullRequest(STOREFRONT, PULL_REQUEST.naturalLanguageSearch, (pullRequest) => ({ ...pullRequest, checks: { value: [], readAt: minutesAgo(3), error: null } }));
    await renderRoute(pullRequestsPath(STOREFRONT), { snapshot: empty });
    const open = await screen.findByRole('region', { name: 'Open' });
    expect(within(within(open).getByRole('link', { name: exactly(SEARCH_TITLE) })).getByRole('img', { name: 'No check reported' })).toBeInTheDocument();
  });

  it('does not call the checks failing for a failure the base branch shares, and does when the change caused one', async () => {
    const shared = { url: 'https://github.example.com/example-org/storefront/pull/57/checks', durationMs: null };
    const sharedOnly = withPullRequest(STOREFRONT, PULL_REQUEST.naturalLanguageSearch, (pullRequest) => ({
      ...pullRequest,
      checks: { value: [{ ...shared, name: 'build', conclusion: 'success', failsOnBase: false }, { ...shared, name: 'docs-links', conclusion: 'failure', failsOnBase: true }], readAt: minutesAgo(3), error: null },
    }));
    await renderRoute(pullRequestsPath(STOREFRONT), { snapshot: sharedOnly });
    const open = await screen.findByRole('region', { name: 'Open' });
    expect(within(within(open).getByRole('link', { name: exactly(SEARCH_TITLE) })).getByRole('img', { name: 'Checks passing · 1 of 2 checks passed' })).toBeInTheDocument();
  });

  it('draws no checks mark for a reading that failed with nothing kept', async () => {
    const failed = withPullRequest(STOREFRONT, PULL_REQUEST.naturalLanguageSearch, (pullRequest) => ({ ...pullRequest, checks: { value: null, readAt: null, error: 'forge unreachable' } }));
    await renderRoute(pullRequestsPath(STOREFRONT), { snapshot: failed });
    const open = await screen.findByRole('region', { name: 'Open' });
    expect(within(within(open).getByRole('link', { name: exactly(SEARCH_TITLE) })).queryByRole('img', { name: /checks? (passed|reported)|No check/ })).not.toBeInTheDocument();
  });

  it('dates an open pull request by when it was opened and a merged one by when it was merged', async () => {
    await renderRoute(pullRequestsPath(STOREFRONT));
    const open = await screen.findByRole('region', { name: 'Open' });
    const opened = within(within(open).getByRole('link', { name: exactly(SEARCH_TITLE) })).getByText(/ago$/);
    expect(opened).toHaveAttribute('datetime', minutesAgo(4170));
    const newest = within(screen.getByRole('region', { name: 'Merged' })).getAllByRole('link')[0];
    expect(within(newest as HTMLElement).getByText(/ago$/)).toHaveAttribute('datetime', minutesAgo(25));
  });

  it('opens the pull request that can be merged when none is named', async () => {
    await renderRoute(pullRequestsPath(STOREFRONT));
    expect(await screen.findByRole('heading', { level: 1, name: SEARCH_TITLE })).toBeInTheDocument();
    expect(titleLink(SEARCH_TITLE)).toHaveAttribute('aria-current', 'page');
  });

  it('selects the pull request named in the address and marks it in the list', async () => {
    await openPullRequest(PULL_REQUEST.checkoutScreenReader);
    expect(screen.getByRole('heading', { level: 1, name: CHECKOUT_TITLE })).toBeInTheDocument();
    const current = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', linkTo(STOREFRONT, 60));
  });

  it('keeps the pull requests of two projects apart when they share a number', async () => {
    await openPullRequest(LEDGER_PULL_REQUEST.webhookSignatures, {}, LEDGER);
    expect(screen.getByRole('heading', { level: 1, name: WEBHOOK_TITLE })).toBeInTheDocument();
    expect(screen.queryByText(HTTP_CLIENT_TITLE)).not.toBeInTheDocument();
  });

  it('shows the pull request of this number in the project of the address', async () => {
    await openPullRequest(PULL_REQUEST.httpClientBump);
    expect(screen.getByRole('heading', { level: 1, name: HTTP_CLIENT_TITLE })).toBeInTheDocument();
    expect(screen.queryByText(WEBHOOK_TITLE)).not.toBeInTheDocument();
  });

  it('lists the pull requests of the project of the address only', async () => {
    await renderRoute(pullRequestsPath(LEDGER));
    const open = await screen.findByRole('region', { name: 'Open' });
    expect(hrefsIn(open)).toEqual([linkTo(LEDGER, 22)]);
    expect(hrefsIn(screen.getByRole('region', { name: 'Merged' }))).toEqual([18, 14, 10].map((number) => linkTo(LEDGER, number)));
    expect(screen.queryByRole('region', { name: 'Closed' })).not.toBeInTheDocument();
  });

  it('says that the pull request does not exist', async () => {
    await renderRoute(pullRequestsPath(STOREFRONT, 999));
    expect(await screen.findByRole('heading', { level: 2, name: 'Pull request not found' })).toBeInTheDocument();
    expect(screen.getByText('The project holds no pull request with this number.')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('does not find a pull request of another project under the number it has there', async () => {
    await renderRoute(pullRequestsPath(STOREFRONT, 10));
    expect(await screen.findByText('Pull request not found')).toBeInTheDocument();
  });

  it('says that the project has no pull request yet', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT, (project) => ({ ...project, pullRequests: [] }));
    await renderRoute(pullRequestsPath(STOREFRONT), { snapshot });
    expect(await screen.findByText('No pull request yet')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});

describe('PullRequestsView merged and closed pull requests', () => {
  it('reads a closed pull request as closed: its state, its group, the time it was opened and no merge time', async () => {
    await openPullRequest(PULL_REQUEST.legacyDateHelpers);
    const article = screen.getByRole('article');
    expect(within(article).getByRole('img', { name: 'Closed' })).toBeInTheDocument();
    expect(within(article).getByText('Closed')).toBeInTheDocument();
    expect(within(article).queryByText('Merged')).not.toBeInTheDocument();
    expect(within(article).getByText('Oct 7, 2026, 9:55 AM')).toHaveAttribute('datetime', minutesAgo(7205));
    expect(within(screen.getByRole('region', { name: 'Closed' })).getByRole('link', { name: exactly('replace the legacy date helpers') })).toHaveAttribute('aria-current', 'page');
  });

  it('reads a merged pull request as merged, with the time it was merged', async () => {
    await openPullRequest(PULL_REQUEST.orderHistoryPagination);
    const article = screen.getByRole('article');
    expect(within(article).getByRole('img', { name: 'Merged' })).toBeInTheDocument();
    expect(within(article).getByText('Oct 12, 2026, 9:35 AM')).toHaveAttribute('datetime', minutesAgo(25));
    expect(within(screen.getByRole('region', { name: 'Merged' })).getByRole('link', { name: exactly('paginate the order history endpoint') })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['merged', PULL_REQUEST.orderHistoryPagination],
    ['closed', PULL_REQUEST.legacyDateHelpers],
  ])('offers no merge and names no blocker for a %s pull request, whatever blockers the snapshot lists', async (_state, number) => {
    const snapshot = withPullRequest(STOREFRONT, number, (pullRequest) => ({ ...pullRequest, mergeable: false, mergeBlockers: ['the issue is closed'] }));
    await openPullRequest(number, { snapshot });
    expect(screen.queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Not mergeable yet' })).not.toBeInTheDocument();
    expect(screen.queryByText('the issue is closed')).not.toBeInTheDocument();
  });

  it('does not flag a merged or closed pull request as ready to merge in the list', async () => {
    await renderRoute(pullRequestsPath(STOREFRONT));
    expect(within(await screen.findByRole('region', { name: 'Merged' })).queryByText('Ready to merge')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Closed' })).queryByText('Ready to merge')).not.toBeInTheDocument();
  });
});

describe('PullRequestsView in French', () => {
  it('words the list, the header and the sections in French', async () => {
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch, { locale: 'fr' });
    for (const name of ['Ouvertes', 'Mergées', 'Fermées']) expect(screen.getByRole('region', { name })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Ouvertes' })).getByText('Prête à merger')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir sur la forge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merger' })).toBeInTheDocument();
    for (const name of ['Preuves', 'Revue', 'Checks', 'Retours externes', 'Fichiers modifiés']) expect(screen.getByRole('region', { name })).toBeInTheDocument();
    expect(screen.getByText('Issue n° 52', { selector: 'a' })).toBeInTheDocument();
  });

  it('counts in the singular for one and the plural for several', async () => {
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch, { locale: 'fr' });
    expect(screen.getByText('9 fichiers · +124 −2')).toBeInTheDocument();
    expect(screen.getByText('1 constat')).toBeInTheDocument();
    expect(screen.getByText('2 constats')).toBeInTheDocument();
    expect(screen.getByText('1 non résolu')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Checks au vert · 4 sur 5 checks réussis' })).toBeInTheDocument();
  });

  it('writes the singular of a count of one in the list and in the summary of the files', async () => {
    const snapshot = withPullRequest(STOREFRONT, PULL_REQUEST.naturalLanguageSearch, (pullRequest) => ({ ...pullRequest, files: pullRequest.files.slice(0, 1) }));
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch, { locale: 'fr', snapshot });
    expect(screen.getByText('1 fichier · +6 −0')).toBeInTheDocument();
  });

  it('says in French that a pull request was not found', async () => {
    await renderRoute(pullRequestsPath(STOREFRONT, 999), { locale: 'fr' });
    expect(await screen.findByText('Pull request introuvable')).toBeInTheDocument();
  });
});

describe('PullRequestsView in English, singular counts', () => {
  it('writes one check and one file in the singular', async () => {
    const snapshot = withPullRequest(LEDGER, LEDGER_PULL_REQUEST.webhookSignatures, (pullRequest) => ({ ...pullRequest, files: pullRequest.files.slice(0, 1) }));
    await openPullRequest(LEDGER_PULL_REQUEST.webhookSignatures, { snapshot }, LEDGER);
    expect(screen.getByRole('img', { name: 'Checks passing · 1 of 1 check passed' })).toBeInTheDocument();
    expect(screen.getByText('1 file · +2 −2')).toBeInTheDocument();
  });
});
