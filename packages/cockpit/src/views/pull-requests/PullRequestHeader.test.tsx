import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PULL_REQUEST as LEDGER_PULL_REQUEST } from '../../test/fixtures/ledger/ids.ts';
import { headSha, PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { LEDGER, minutesAgo, openPullRequest, pullRequestsPath, SEARCH_TITLE, short, STOREFRONT, withPullRequest } from './pull-request-test-support.ts';

describe('PullRequestsView header', () => {
  it('names the pull request, its state, its number and the type of its issue', async () => {
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch);
    const article = screen.getByRole('article');
    expect(within(article).getByRole('heading', { level: 1, name: SEARCH_TITLE })).toBeInTheDocument();
    expect(within(article).getByRole('img', { name: 'Open' })).toBeInTheDocument();
    expect(within(article).getByText('#57')).toBeInTheDocument();
    expect(within(article).getByText('Prompt')).toBeInTheDocument();
  });

  it('links to the pull request on the forge in a new tab', async () => {
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch);
    const link = screen.getByRole('link', { name: 'Open on the forge' });
    expect(link).toHaveAttribute('href', 'https://github.example.com/example-org/storefront/pull/57');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('opens a pull request of a local forge, served by the API, in a new tab as well', async () => {
    await openPullRequest(LEDGER_PULL_REQUEST.webhookSignatures, {}, LEDGER);
    const link = screen.getByRole('link', { name: 'Open on the forge' });
    expect(link).toHaveAttribute('href', '/api/projects/ledger/forge/pulls/22.md');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('says that a pull request has no forge link instead of offering a dead one', async () => {
    const snapshot = withPullRequest(STOREFRONT, PULL_REQUEST.naturalLanguageSearch, (pullRequest) => ({ ...pullRequest, url: '' }));
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch, { snapshot });
    expect(screen.queryByRole('link', { name: 'Open on the forge' })).not.toBeInTheDocument();
    expect(screen.getByText('No forge link')).toBeInTheDocument();
  });

  it('links to the issue of the pull request in the same project', async () => {
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch);
    expect(within(screen.getByRole('article')).getByRole('link', { name: 'Issue #52' })).toHaveAttribute('href', '/projects/storefront/issues/52');
  });

  it('links a pull request of the ledger to the issue of the ledger, not to the storefront issue of the same number', async () => {
    await openPullRequest(LEDGER_PULL_REQUEST.webhookSignatures, {}, LEDGER);
    expect(within(screen.getByRole('article')).getByRole('link', { name: 'Issue #19' })).toHaveAttribute('href', '/projects/ledger/issues/19');
  });

  it('gives the branch and the head commit, whose full hash is one hover away', async () => {
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch);
    const article = screen.getByRole('article');
    expect(within(article).getByText('factory/52-natural-language-search')).toBeInTheDocument();
    const head = within(within(article).getByText('Head')).getByText(short(headSha(PULL_REQUEST.naturalLanguageSearch)));
    expect(head).toHaveAttribute('title', headSha(PULL_REQUEST.naturalLanguageSearch));
  });

  it('gives the time the pull request was opened, and the time it was merged once it is', async () => {
    await openPullRequest(PULL_REQUEST.orderHistoryPagination);
    const article = screen.getByRole('article');
    expect(within(article).getByText('Oct 12, 2026, 8:46 AM')).toHaveAttribute('datetime', minutesAgo(74));
    expect(within(article).getByText('Oct 12, 2026, 9:35 AM')).toHaveAttribute('datetime', minutesAgo(25));
    expect(within(article).getAllByText('Merged')).toHaveLength(2);
  });

  it('gives no merge time for a pull request that is still open', async () => {
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch);
    expect(within(screen.getByRole('article')).queryByText(/^Merged/)).not.toBeInTheDocument();
  });

  it('comes back to the list from the detail', async () => {
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch);
    expect(within(screen.getByRole('article')).getByRole('link', { name: 'All pull requests' })).toHaveAttribute('href', pullRequestsPath(STOREFRONT));
  });
});
