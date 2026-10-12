import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { headSha } from '../../test/fixtures/storefront/ids.ts';
import { diffKey } from '../../test/fake-transport.ts';
import { BOUND_FILE, diffOf, filePatch, holdDiffs, PROMPT_FILE, PROMPT_PATCH, READ_FAILURE, region, SEARCH, serveDiff, toggle } from './pull-request-diff-test-support.ts';
import { minutesAgo, openPullRequest, short, STOREFRONT } from './pull-request-test-support.ts';

const STALE_READ_MINUTES = 20;
const TRUNCATED_NOTE = 'The change of this file is too large to show whole: the patch is cut.';
const READ_AGAIN = { name: 'Read the changes again' } as const;
const NEWER_HEAD = 'c'.repeat(40);

describe('PullRequestsView patches that cannot be shown whole', () => {
  it('says that a patch is cut when the change is too large to show whole', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH, true)]);
    await view.user.click(toggle(PROMPT_FILE));
    await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    expect(within(region()).getByText(TRUNCATED_NOTE)).toBeInTheDocument();
    expect(within(diffOf(PROMPT_FILE) as HTMLElement).getByText('## Price and colour words')).toBeInTheDocument();
  });

  it('does not say that a whole patch is cut', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    await view.user.click(toggle(PROMPT_FILE));
    await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    expect(within(region()).queryByText(/the patch is cut/)).not.toBeInTheDocument();
  });

  it('says that the diff holds no patch for a file it does not list', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    await view.user.click(toggle(BOUND_FILE));
    const row = toggle(BOUND_FILE).closest('li') as HTMLElement;
    expect(await within(row).findByText('The diff holds no patch for this file.')).toBeInTheDocument();
    expect(diffOf(BOUND_FILE)).not.toBeInTheDocument();
  });

  it('says the same for a file whose patch is empty', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, '  ')]);
    await view.user.click(toggle(PROMPT_FILE));
    const row = toggle(PROMPT_FILE).closest('li') as HTMLElement;
    expect(await within(row).findByText('The diff holds no patch for this file.')).toBeInTheDocument();
  });

  it('warns when the diff was read at another commit than the one the pull request is at', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)], {}, STOREFRONT, SEARCH, NEWER_HEAD);
    await view.user.click(toggle(PROMPT_FILE));
    await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    expect(within(region()).getByRole('note')).toHaveTextContent(`This diff was read at commit ccccccc, but the pull request is at ${short(headSha(SEARCH))}.`);
  });

  it('does not warn when the diff was read at the commit the pull request is at', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    await view.user.click(toggle(PROMPT_FILE));
    await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    expect(within(region()).queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('PullRequestsView when the diff was read', () => {
  it('says when the diff was read', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    await view.user.click(toggle(PROMPT_FILE));
    await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    expect(within(region()).getByText(/^Read 1 min/)).toHaveAttribute('datetime', minutesAgo(1));
    expect(within(region()).queryByText('Stale')).not.toBeInTheDocument();
  });

  it('marks a diff read long ago as stale, since the forge may hold more by now', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)], { readAt: minutesAgo(STALE_READ_MINUTES) });
    await view.user.click(toggle(PROMPT_FILE));
    await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    expect(within(region()).getByText('Stale')).toBeInTheDocument();
    expect(within(region()).getByText(/^Read 20 min/)).toHaveAttribute('datetime', minutesAgo(STALE_READ_MINUTES));
  });
});

describe('PullRequestsView patches that could not be read', () => {
  it('says why the diff could not be read and offers to read it again', async () => {
    const view = await openPullRequest(SEARCH);
    view.transport.diffFailure = READ_FAILURE;
    await view.user.click(toggle(PROMPT_FILE));
    expect(await within(region()).findByText(`The last read failed: ${READ_FAILURE}`)).toBeInTheDocument();
    expect(within(region()).getByRole('button', READ_AGAIN)).toBeInTheDocument();
    expect(diffOf(PROMPT_FILE)).not.toBeInTheDocument();
    expect(within(region()).queryByText('Reading the changes…')).not.toBeInTheDocument();
  });

  it('reads the diff again on request and shows the patch once it arrives', async () => {
    const view = await openPullRequest(SEARCH);
    view.transport.diffFailure = READ_FAILURE;
    await view.user.click(toggle(PROMPT_FILE));
    await view.user.click(await within(region()).findByRole('button', READ_AGAIN));
    expect(await within(region()).findByText(`The last read failed: ${READ_FAILURE}`)).toBeInTheDocument();
    view.transport.diffFailure = null;
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    await view.user.click(within(region()).getByRole('button', READ_AGAIN));
    expect(await screen.findByLabelText(`Changes in ${PROMPT_FILE}`)).toBeInTheDocument();
    expect(within(region()).queryByText(/The last read failed/)).not.toBeInTheDocument();
    expect(view.transport.diffRequests).toHaveLength(3);
  });

  it('says that the factory knows no such pull request when it serves no diff for it', async () => {
    const view = await openPullRequest(SEARCH);
    view.transport.diffs.delete(diffKey(STOREFRONT, SEARCH));
    await view.user.click(toggle(PROMPT_FILE));
    expect(await within(region()).findByText(/The last read failed: the factory knows no pull request 57 in storefront/)).toBeInTheDocument();
  });
});

describe('PullRequestsView patches read again', () => {
  it('offers to read the diff again once it is read, and keeps the patches in place while it is read', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    await view.user.click(toggle(PROMPT_FILE));
    await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    const release = holdDiffs(view);
    await view.user.click(within(region()).getByRole('button', READ_AGAIN));
    await waitFor(() => expect(within(region()).queryByRole('button', READ_AGAIN)).not.toBeInTheDocument());
    expect(diffOf(PROMPT_FILE)).toBeInTheDocument();
    expect(within(region()).queryByText('Reading the changes…')).not.toBeInTheDocument();
    release();
    expect(await within(region()).findByRole('button', READ_AGAIN)).toBeInTheDocument();
    expect(diffOf(PROMPT_FILE)).toBeInTheDocument();
    expect(view.transport.diffRequests).toHaveLength(2);
  });

  it('keeps the patches of the earlier read and says that the last read failed when reading again fails', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    await view.user.click(toggle(PROMPT_FILE));
    await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    view.transport.diffFailure = READ_FAILURE;
    await view.user.click(within(region()).getByRole('button', READ_AGAIN));
    const note = await within(region()).findByRole('note');
    expect(note).toHaveTextContent(`The last read failed (${READ_FAILURE}). This is the value read 1 min`);
    expect(within(diffOf(PROMPT_FILE) as HTMLElement).getByText('## Price and colour words')).toBeInTheDocument();
    expect(within(region()).getByText(/^Read 1 min/)).toHaveAttribute('datetime', minutesAgo(1));
    expect(within(region()).getByRole('button', READ_AGAIN)).toBeInTheDocument();
  });

  it('replaces the kept patches by the new ones once reading again succeeds', async () => {
    const view = await openPullRequest(SEARCH);
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)]);
    await view.user.click(toggle(PROMPT_FILE));
    await screen.findByLabelText(`Changes in ${PROMPT_FILE}`);
    view.transport.diffFailure = READ_FAILURE;
    await view.user.click(within(region()).getByRole('button', READ_AGAIN));
    await within(region()).findByRole('note');
    view.transport.diffFailure = null;
    serveDiff(view, [filePatch(PROMPT_FILE, '@@ -1,1 +1,2 @@\n # Query rewrite\n+Answer in the language of the query.')]);
    await view.user.click(within(region()).getByRole('button', READ_AGAIN));
    expect(await within(diffOf(PROMPT_FILE) as HTMLElement).findByText('Answer in the language of the query.')).toBeInTheDocument();
    expect(within(region()).queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('PullRequestsView patches in French', () => {
  it('words the reading and the cut patch in French', async () => {
    const view = await openPullRequest(SEARCH, { locale: 'fr' });
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH, true)]);
    const release = holdDiffs(view);
    await view.user.click(screen.getByRole('button', { name: `Changements de ${PROMPT_FILE}` }));
    expect(await screen.findByText('Lecture des changements…')).toBeInTheDocument();
    release();
    expect(await screen.findByText('Le changement de ce fichier est trop grand pour être affiché en entier : le patch est tronqué.')).toBeInTheDocument();
  });

  it('words a failed read in French', async () => {
    const view = await openPullRequest(SEARCH, { locale: 'fr' });
    view.transport.diffFailure = READ_FAILURE;
    await view.user.click(screen.getByRole('button', { name: `Changements de ${PROMPT_FILE}` }));
    expect(await screen.findByRole('button', { name: 'Relire les changements' })).toBeInTheDocument();
    expect(screen.getByText(`Le dernier relevé a échoué : ${READ_FAILURE}`)).toBeInTheDocument();
  });

  it('words the head commit mismatch in French', async () => {
    const view = await openPullRequest(SEARCH, { locale: 'fr' });
    serveDiff(view, [filePatch(PROMPT_FILE, PROMPT_PATCH)], {}, STOREFRONT, SEARCH, NEWER_HEAD);
    await view.user.click(screen.getByRole('button', { name: `Changements de ${PROMPT_FILE}` }));
    expect(await screen.findByText(`Ce diff a été relevé au commit ccccccc, mais la pull request est au commit ${short(headSha(SEARCH))}.`)).toBeInTheDocument();
  });
});
