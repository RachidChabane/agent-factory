import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LEDGER_ID } from '../../test/fixtures/project-ids.ts';
import { headSha as ledgerHeadSha, PULL_REQUEST as LEDGER_PULL_REQUEST } from '../../test/fixtures/ledger/ids.ts';
import { PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { BOUND_FILE, BOUND_PATCH, diffOf, filePatch, holdDiffs, PROMPT_FILE, PROMPT_PATCH, region, SEARCH, serveDiff, toggle } from './pull-request-diff-test-support.ts';
import { openPullRequest, STOREFRONT, withPullRequest } from './pull-request-test-support.ts';

const rows = () => within(within(region()).getByRole('list', { name: 'Changed files' })).getAllByRole('listitem');

describe('PullRequestsView changed files', () => {
  it('lists the files with their additions and deletions, and totals them', async () => {
    await openPullRequest(SEARCH);
    expect(within(region()).getByText('9 files · +124 −2')).toBeInTheDocument();
    expect(rows()).toHaveLength(9);
    const first = rows()[0] as HTMLElement;
    expect(within(first).getByText(PROMPT_FILE)).toBeInTheDocument();
    expect(within(first).getByText('+6')).toBeInTheDocument();
    expect(within(first).getByText('−0')).toBeInTheDocument();
  });

  it('shows a file that only removes lines with its deletions', async () => {
    const snapshot = withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, files: [{ path: 'web/src/search/legacy.ts', additions: 0, deletions: 48 }] }));
    await openPullRequest(SEARCH, { snapshot });
    const [row] = rows();
    expect(within(row as HTMLElement).getByText('+0')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('−48')).toBeInTheDocument();
    expect(within(region()).getByText('1 file · +0 −48')).toBeInTheDocument();
  });

  it('says that no changed file is recorded rather than counting zero files', async () => {
    const snapshot = withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, files: [] }));
    await openPullRequest(SEARCH, { snapshot });
    expect(within(region()).getByText('No changed file is recorded for this pull request.')).toBeInTheDocument();
    expect(within(region()).queryByText(/^0 files/)).not.toBeInTheDocument();
    expect(within(region()).queryByRole('list')).not.toBeInTheDocument();
    expect(within(region()).queryByRole('button')).not.toBeInTheDocument();
  });

  it('reads nothing from the factory until the operator asks for a patch', async () => {
    const view = await openPullRequest(SEARCH);
    expect(toggle(PROMPT_FILE)).toHaveAttribute('aria-expanded', 'false');
    expect(diffOf(PROMPT_FILE)).not.toBeInTheDocument();
    expect(view.transport.diffRequests).toEqual([]);
  });

  it('words the files and the buttons in French', async () => {
    const view = await openPullRequest(SEARCH, { locale: 'fr' });
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    const french = screen.getByRole('region', { name: 'Fichiers modifiés' });
    expect(within(french).getByText('9 fichiers · +124 −2')).toBeInTheDocument();
    expect(within(french).getByRole('list', { name: 'Fichiers modifiés' })).toBeInTheDocument();
    await view.user.click(within(french).getByRole('button', { name: 'Afficher tous les changements' }));
    expect(await screen.findByLabelText(`Modifications de ${PROMPT_FILE}`)).toBeInTheDocument();
    expect(within(french).getByRole('button', { name: 'Masquer tous les changements' })).toBeInTheDocument();
    expect(within(french).getAllByText('Le diff ne contient aucun patch pour ce fichier.').length).toBeGreaterThan(0);
  });
});

describe('PullRequestsView patches read on demand', () => {
  it('shows the patch the factory serves for the pull request of the world', async () => {
    const view = await openPullRequest(SEARCH);
    await view.user.click(toggle(PROMPT_FILE));
    const diff = await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    expect(within(diff).getByText('## Price and colour words')).toBeInTheDocument();
    expect(view.transport.diffRequests).toEqual([{ project: STOREFRONT, pullRequestNumber: SEARCH }]);
    expect(within(region()).queryByRole('note')).not.toBeInTheDocument();
  });

  it('reads the diff of the pull request when the first patch is opened, and shows the patch of that file', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH), filePatch(BOUND_FILE, BOUND_PATCH)]);
    await view.user.click(toggle(PROMPT_FILE));
    expect(toggle(PROMPT_FILE)).toHaveAttribute('aria-expanded', 'true');
    const diff = await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    expect(within(diff).getByText('## Price and colour words')).toBeInTheDocument();
    expect(diffOf(BOUND_FILE)).not.toBeInTheDocument();
    expect(view.transport.diffRequests).toEqual([{ project: STOREFRONT, pullRequestNumber: SEARCH }]);
  });

  it('opens a second patch without reading the diff again', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH), filePatch(BOUND_FILE, BOUND_PATCH)]);
    await view.user.click(toggle(PROMPT_FILE));
    await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    await view.user.click(toggle(BOUND_FILE));
    expect(within(await screen.findByLabelText(`Changes in ${BOUND_FILE}`)).getByText("export type PriceDirection = 'max' | 'min';")).toBeInTheDocument();
    expect(view.transport.diffRequests).toHaveLength(1);
  });

  it('closes a patch and opens it again without reading the diff again', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    await view.user.click(toggle(PROMPT_FILE));
    await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    await view.user.click(toggle(PROMPT_FILE));
    expect(toggle(PROMPT_FILE)).toHaveAttribute('aria-expanded', 'false');
    expect(diffOf(PROMPT_FILE)).not.toBeInTheDocument();
    await view.user.click(toggle(PROMPT_FILE));
    expect(await screen.findByLabelText(`Changes in ${PROMPT_FILE}`)).toBeInTheDocument();
    expect(view.transport.diffRequests).toHaveLength(1);
  });

  it('opens every patch with one read, and closes them all again', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH), filePatch(BOUND_FILE, BOUND_PATCH)]);
    await view.user.click(within(region()).getByRole('button', { name: 'Show all changes' }));
    expect(await screen.findByLabelText(`Changes in ${PROMPT_FILE}`)).toBeInTheDocument();
    expect(await screen.findByLabelText(`Changes in ${BOUND_FILE}`)).toBeInTheDocument();
    expect(within(region()).getAllByRole('button', { expanded: true })).toHaveLength(9);
    expect(view.transport.diffRequests).toHaveLength(1);
    await view.user.click(within(region()).getByRole('button', { name: 'Hide all changes' }));
    expect(diffOf(PROMPT_FILE)).not.toBeInTheDocument();
    expect(within(region()).getByRole('button', { name: 'Show all changes' })).toBeInTheDocument();
  });

  it('offers to hide all the changes once the last one is opened by hand', async () => {
    const view = await openPullRequest(PULL_REQUEST.localSetupDocs);
    const buttons = within(region()).getAllByRole('button', { name: /^Changes of / });
    for (const button of buttons) await view.user.click(button);
    expect(within(region()).getByRole('button', { name: 'Hide all changes' })).toBeInTheDocument();
  });

  it('opens a patch from the keyboard', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    toggle(PROMPT_FILE).focus();
    await view.user.keyboard('{Enter}');
    expect(toggle(PROMPT_FILE)).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByLabelText(`Changes in ${PROMPT_FILE}`)).toBeInTheDocument();
    await view.user.keyboard(' ');
    expect(toggle(PROMPT_FILE)).toHaveAttribute('aria-expanded', 'false');
  });

  it('says that the changes are being read until the diff arrives', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    const release = holdDiffs(view);
    await view.user.click(toggle(PROMPT_FILE));
    expect(await within(region()).findByText('Reading the changes…')).toBeInTheDocument();
    expect(diffOf(PROMPT_FILE)).not.toBeInTheDocument();
    release();
    expect(await screen.findByLabelText(`Changes in ${PROMPT_FILE}`)).toBeInTheDocument();
    expect(within(region()).queryByText('Reading the changes…')).not.toBeInTheDocument();
  });

  it('keeps reading the diff of the project of the address', async () => {
    const view = await openPullRequest(LEDGER_PULL_REQUEST.webhookSignatures, {}, LEDGER_ID);
    serveDiff(view, [filePatch('src/ledger/webhooks/signing.py', '@@ -1,2 +1,2 @@\n-SECRET = old()\n+SECRET = rotating()')], {}, LEDGER_ID, LEDGER_PULL_REQUEST.webhookSignatures, ledgerHeadSha(LEDGER_PULL_REQUEST.webhookSignatures));
    await view.user.click(toggle('src/ledger/webhooks/signing.py'));
    expect(await screen.findByLabelText('Changes in src/ledger/webhooks/signing.py')).toBeInTheDocument();
    expect(view.transport.diffRequests).toEqual([{ project: LEDGER_ID, pullRequestNumber: LEDGER_PULL_REQUEST.webhookSignatures }]);
  });

  it('forgets which patches were open when another pull request is selected', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    await view.user.click(toggle(PROMPT_FILE));
    await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    await view.user.click(screen.getByRole('link', { name: /tell customers when a promo code has expired/ }));
    await view.expectLocation('/projects/storefront/pull-requests/62');
    expect(within(await screen.findByRole('region', { name: 'Changed files' })).queryByRole('button', { expanded: true })).not.toBeInTheDocument();
    await waitFor(() => expect(view.transport.diffRequests).toHaveLength(1));
  });
});
