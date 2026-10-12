import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { repositoryFilePath } from '../../contract/index.ts';
import { headSha as ledgerHeadSha, PULL_REQUEST as LEDGER_PULL_REQUEST } from '../../test/fixtures/ledger/ids.ts';
import { LEDGER_ID } from '../../test/fixtures/project-ids.ts';
import { headSha } from '../../test/fixtures/storefront/ids.ts';
import { diffOf, filePatch, holdDiffs, PROMPT_FILE, PROMPT_PATCH, region, SEARCH, serveDiff, toggle } from './pull-request-diff-test-support.ts';
import { openPullRequest, STOREFRONT, withPullRequest } from './pull-request-test-support.ts';

const IMAGE_FILE = 'web/public/search-empty.png';
const REMOVED_FILE = 'web/src/search/legacy.ts';
const TRIMMED_FILE = 'web/src/search/synonyms.ts';
const SIGNING_FILE = 'src/ledger/webhooks/signing.py';
const DELETION_PATCH = '@@ -1,48 +0,0 @@\n-export const LEGACY_WORDS = [];';
const TRIMMING_PATCH = '@@ -10,6 +10,3 @@\n export const SYNONYMS = {\n-  cheap: [],\n-  budget: [],\n-  bargain: [],\n };';
const BINARY_PATCH = `Binary files a/${IMAGE_FILE} and b/${IMAGE_FILE} differ`;

const withFile = (path: string, additions: number, deletions: number) =>
  withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, files: [...pullRequest.files, { path, additions, deletions }] }));

describe('PullRequestsView patches without hunks', () => {
  it('shows the sentence the diff gives for a binary file as it is written, without lines to colour', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: withFile(IMAGE_FILE, 0, 0) });
    serveDiff(view, [filePatch(IMAGE_FILE, BINARY_PATCH)]);
    await view.user.click(toggle(IMAGE_FILE));
    const row = toggle(IMAGE_FILE).closest('li') as HTMLElement;
    expect(await within(row).findByText(BINARY_PATCH)).toBeInTheDocument();
    expect(diffOf(IMAGE_FILE)).not.toBeInTheDocument();
    expect(within(row).queryByText('The diff holds no patch for this file.')).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Copy content' })).not.toBeInTheDocument();
  });

  it('shows the patches with hunks of the same diff coloured as usual', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: withFile(IMAGE_FILE, 0, 0) });
    serveDiff(view, [filePatch(IMAGE_FILE, BINARY_PATCH), filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    await view.user.click(within(region()).getByRole('button', { name: 'Show all changes' }));
    expect(await screen.findByLabelText(`Changes in ${PROMPT_FILE}`)).toBeInTheDocument();
    expect(within(region()).getByText(BINARY_PATCH)).toBeInTheDocument();
  });
});

describe('PullRequestsView files at the head commit', () => {
  const fileLink = (path: string) => within(region()).queryByRole('link', { name: `View the file at this commit: ${path}` });

  it('offers the file as the head commit holds it, in a new tab, once the row is open', async () => {
    const view = await openPullRequest(SEARCH);
    expect(fileLink(PROMPT_FILE)).not.toBeInTheDocument();
    await view.user.click(toggle(PROMPT_FILE));
    const link = fileLink(PROMPT_FILE) as HTMLElement;
    expect(link).toHaveAttribute('href', repositoryFilePath(STOREFRONT, headSha(SEARCH), PROMPT_FILE));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link).toHaveTextContent('View the file at this commit');
  });

  it('follows the head commit of the pull request of the address', async () => {
    const view = await openPullRequest(LEDGER_PULL_REQUEST.webhookSignatures, {}, LEDGER_ID);
    await view.user.click(toggle(SIGNING_FILE));
    expect(fileLink(SIGNING_FILE)).toHaveAttribute('href', repositoryFilePath(LEDGER_ID, ledgerHeadSha(LEDGER_PULL_REQUEST.webhookSignatures), SIGNING_FILE));
  });

  it('offers no link for a file the change deletes, since the head commit holds nothing at its path', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: withFile(REMOVED_FILE, 0, 48) });
    serveDiff(view, [filePatch(REMOVED_FILE, DELETION_PATCH)]);
    await view.user.click(toggle(REMOVED_FILE));
    await screen.findByLabelText(`Changes in ${REMOVED_FILE}`);
    expect(fileLink(REMOVED_FILE)).not.toBeInTheDocument();
    await view.user.click(toggle(PROMPT_FILE));
    expect(fileLink(PROMPT_FILE)).toBeInTheDocument();
  });

  it('offers no link for a file that only lost lines until its patch shows that it is still there', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: withFile(TRIMMED_FILE, 0, 3) });
    serveDiff(view, [filePatch(TRIMMED_FILE, TRIMMING_PATCH)]);
    const release = holdDiffs(view);
    await view.user.click(toggle(TRIMMED_FILE));
    expect(await within(region()).findByText('Reading the changes…')).toBeInTheDocument();
    expect(fileLink(TRIMMED_FILE)).not.toBeInTheDocument();
    release();
    expect(await screen.findByLabelText(`Changes in ${TRIMMED_FILE}`)).toBeInTheDocument();
    expect(fileLink(TRIMMED_FILE)).toHaveAttribute('href', repositoryFilePath(STOREFRONT, headSha(SEARCH), TRIMMED_FILE));
  });

  it('offers no link for a file that only lost lines when the diff holds no patch for it', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: withFile(TRIMMED_FILE, 0, 3) });
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    await view.user.click(toggle(TRIMMED_FILE));
    const row = toggle(TRIMMED_FILE).closest('li') as HTMLElement;
    expect(await within(row).findByText('The diff holds no patch for this file.')).toBeInTheDocument();
    expect(fileLink(TRIMMED_FILE)).not.toBeInTheDocument();
  });

  it('offers the link for a file whose change adds nothing and removes nothing', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: withFile(IMAGE_FILE, 0, 0) });
    await view.user.click(toggle(IMAGE_FILE));
    expect(fileLink(IMAGE_FILE)).toHaveAttribute('href', repositoryFilePath(STOREFRONT, headSha(SEARCH), IMAGE_FILE));
  });

  it('words the link in French', async () => {
    const view = await openPullRequest(SEARCH, { locale: 'fr' });
    await view.user.click(screen.getByRole('button', { name: `Changements de ${PROMPT_FILE}` }));
    const link = screen.getByRole('link', { name: `Voir le fichier à ce commit : ${PROMPT_FILE}` });
    expect(link).toHaveTextContent('Voir le fichier à ce commit');
    expect(link).toHaveAttribute('href', repositoryFilePath(STOREFRONT, headSha(SEARCH), PROMPT_FILE));
  });
});
