import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickConfirmAndExpectCommand, expectCommand } from '../../test/commands.ts';
import { headSha as ledgerHeadSha, PULL_REQUEST as LEDGER_PULL_REQUEST } from '../../test/fixtures/ledger/ids.ts';
import { headSha, PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { renderRoute } from '../../test/render.tsx';
import { LEDGER, openPullRequest, pullRequestsPath, short, STOREFRONT, withPullRequest } from './pull-request-test-support.ts';

const SEARCH = PULL_REQUEST.naturalLanguageSearch;
const MERGE_BODY = { project: STOREFRONT, number: SEARCH, expectedHeadSha: headSha(SEARCH) };
const MERGE_DIALOG = 'Merge #57?';

const mergeButton = () => screen.getByRole('button', { name: 'Merge' });

/** The elements the description of an element points at. */
function describedBy(element: HTMLElement): HTMLElement[] {
  const ids = (element.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id.length > 0);
  return ids.map((id) => {
    const target = document.getElementById(id);
    if (target === null) throw new Error(`nothing has the id ${id}`);
    return target;
  });
}

/** The pull request whose given check runs fail, as they do on the base branch too. */
const failingOnBase = (names: readonly string[]) =>
  withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({
    ...pullRequest,
    checks: { ...pullRequest.checks, value: (pullRequest.checks.value ?? []).map((entry) => (names.includes(entry.name) ? { ...entry, conclusion: 'failure' as const, failsOnBase: true } : entry)) },
  }));

describe('PullRequestsView merge', () => {
  it('offers to merge a pull request that is open, mergeable and blocked by nothing', async () => {
    await openPullRequest(SEARCH);
    expect(mergeButton()).toBeEnabled();
    expect(screen.queryByRole('region', { name: 'Not mergeable yet' })).not.toBeInTheDocument();
  });

  it('asks before sending anything, and shows what is about to be merged', async () => {
    const view = await openPullRequest(SEARCH);
    await view.user.click(mergeButton());
    const dialog = await screen.findByRole('dialog', { name: MERGE_DIALOG });
    expect(view.transport.commands).toEqual([]);
    expect(within(dialog).getByText('The factory squash-merges the pull request into main, only if its head is still the commit shown below.')).toBeInTheDocument();
    expect(within(dialog).getByText('feat(search): understand colour and price words in the product search')).toBeInTheDocument();
    expect(within(dialog).getByText('factory/52-natural-language-search')).toBeInTheDocument();
    expect(within(dialog).getByText(short(headSha(SEARCH)))).toHaveAttribute('title', headSha(SEARCH));
    expect(within(dialog).getByText('4 of 5 checks passed')).toBeInTheDocument();
    expect(within(dialog).getByText('Evidence complete')).toBeInTheDocument();
  });

  it('says in the confirmation that no check was reported when the forge lists none', async () => {
    const snapshot = withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, checks: { value: [], readAt: '2026-10-12T09:57:00.000Z', error: null } }));
    const view = await openPullRequest(SEARCH, { snapshot });
    await view.user.click(mergeButton());
    expect(within(await screen.findByRole('dialog', { name: MERGE_DIALOG })).getByText('No check reported')).toBeInTheDocument();
  });

  it('says in the confirmation that the checks were not read when the reading holds nothing', async () => {
    const snapshot = withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, checks: { value: null, readAt: null, error: null } }));
    const view = await openPullRequest(SEARCH, { snapshot });
    await view.user.click(mergeButton());
    expect(within(await screen.findByRole('dialog', { name: MERGE_DIALOG })).getByText('Not read yet')).toBeInTheDocument();
  });

  it('says in the confirmation which failing checks the base branch fails too, since they do not block the merge', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: failingOnBase(['deploy-preview']) });
    await view.user.click(mergeButton());
    const dialog = await screen.findByRole('dialog', { name: MERGE_DIALOG });
    expect(within(dialog).getByText('4 of 5 checks passed · 1 also fails on the base branch')).toBeInTheDocument();
  });

  it('merges, once the operator confirms, the head commit the operator was shown', async () => {
    const view = await openPullRequest(SEARCH);
    await clickConfirmAndExpectCommand(view.user, mergeButton(), MERGE_DIALOG, 'Merge #57', view.transport, 'pr.merge', MERGE_BODY);
  });

  it('closes the confirmation and shows what the factory did once the merge is accepted', async () => {
    const view = await openPullRequest(SEARCH);
    view.transport.effects.set('pr.merge', 'Pull request #57 merged as 4b2c9d1');
    await view.user.click(mergeButton());
    await view.user.click(within(await screen.findByRole('dialog', { name: MERGE_DIALOG })).getByRole('button', { name: 'Merge #57' }));
    expect(await within(screen.getByRole('status')).findByText('Pull request #57 merged as 4b2c9d1')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sends nothing when the operator cancels', async () => {
    const view = await openPullRequest(SEARCH);
    await view.user.click(mergeButton());
    await view.user.click(within(await screen.findByRole('dialog', { name: MERGE_DIALOG })).getByRole('button', { name: 'Cancel' }));
    expect(view.transport.commands).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the refusal of the factory and keeps the confirmation open', async () => {
    const view = await openPullRequest(SEARCH);
    view.transport.commandFailure = 'the head is c0ffee on GitHub, not the expected 7d59d45';
    await view.user.click(mergeButton());
    await view.user.click(within(await screen.findByRole('dialog', { name: MERGE_DIALOG })).getByRole('button', { name: 'Merge #57' }));
    expect(await within(screen.getByRole('alert')).findByText('the head is c0ffee on GitHub, not the expected 7d59d45')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: MERGE_DIALOG })).toBeInTheDocument();
    expect(view.transport.commands).toHaveLength(1);
  });

  it('disables the confirmation while the merge is in flight, and sends it only once', async () => {
    const view = await openPullRequest(SEARCH);
    const release = view.transport.holdCommands();
    await view.user.click(mergeButton());
    const dialog = await screen.findByRole('dialog', { name: MERGE_DIALOG });
    await view.user.click(within(dialog).getByRole('button', { name: 'Merge #57' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Merge #57' })).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(view.transport.commands).toHaveLength(1);
  });

  it('opens the confirmation from the keyboard', async () => {
    const view = await openPullRequest(SEARCH);
    mergeButton().focus();
    await view.user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: MERGE_DIALOG })).toBeInTheDocument();
  });

  it('merges a pull request of the ledger in the ledger, with the head of the ledger', async () => {
    const view = await openPullRequest(LEDGER_PULL_REQUEST.webhookSignatures, {}, LEDGER);
    await clickConfirmAndExpectCommand(view.user, mergeButton(), 'Merge #22?', 'Merge #22', view.transport, 'pr.merge', {
      project: LEDGER,
      number: LEDGER_PULL_REQUEST.webhookSignatures,
      expectedHeadSha: ledgerHeadSha(LEDGER_PULL_REQUEST.webhookSignatures),
    });
  });
});

describe('PullRequestsView merge blockers', () => {
  it('disables the merge of a pull request that has blockers and lists them', async () => {
    const view = await openPullRequest(PULL_REQUEST.checkoutScreenReader);
    expect(mergeButton()).toBeDisabled();
    const notice = screen.getByRole('region', { name: 'Not mergeable yet' });
    const blockers = within(notice).getByRole('list', { name: 'Merge blockers' });
    expect(within(blockers).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'The evidence is incomplete: recording of the keyboard-only checkout journey.',
      'The checks of the head commit have not been read for 40 minutes: GitHub API rate limit exceeded.',
    ]);
    await view.user.click(mergeButton());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('ties the disabled merge to the reasons it is disabled', async () => {
    await openPullRequest(PULL_REQUEST.expiredPromoMessage);
    expect(mergeButton()).toBeDisabled();
    expect(mergeButton()).toHaveAccessibleDescription(expect.stringContaining('The check e2e-checkout failed.'));
    const blockers = within(screen.getByRole('region', { name: 'Not mergeable yet' })).getByRole('list', { name: 'Merge blockers' });
    expect(within(blockers).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['The check e2e-checkout failed.', 'The check deploy-preview is still running.']);
  });

  it('points the disabled merge at the reasons themselves, which a browser reads by their text and not by the label of the callout', async () => {
    await openPullRequest(PULL_REQUEST.expiredPromoMessage);
    const described = describedBy(mergeButton());
    expect(described.map((element) => element.textContent)).toEqual(['The check e2e-checkout failed.', 'The check deploy-preview is still running.']);
    for (const element of described) expect(element).not.toHaveAttribute('aria-label');
  });

  it('points the disabled merge at the sentence that says the factory names no blocker', async () => {
    const snapshot = withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, mergeable: false, mergeBlockers: [] }));
    await openPullRequest(SEARCH, { snapshot });
    expect(describedBy(mergeButton()).map((element) => element.textContent)).toEqual(['The factory does not say what blocks the merge.']);
  });

  it('still explains a pull request that is not mergeable although the factory names no blocker', async () => {
    const snapshot = withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, mergeable: false, mergeBlockers: [] }));
    await openPullRequest(SEARCH, { snapshot });
    expect(mergeButton()).toBeDisabled();
    expect(within(screen.getByRole('region', { name: 'Not mergeable yet' })).getByText('The factory does not say what blocks the merge.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Merge blockers' })).not.toBeInTheDocument();
  });

  it('holds back a pull request flagged mergeable when blockers are named', async () => {
    const snapshot = withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, mergeable: true, mergeBlockers: ['the issue is implementing'] }));
    await openPullRequest(SEARCH, { snapshot });
    expect(mergeButton()).toBeDisabled();
    expect(within(screen.getByRole('list', { name: 'Merge blockers' })).getByText('the issue is implementing')).toBeInTheDocument();
  });

  it('offers no merge and names no blocker for a pull request that is merged', async () => {
    await openPullRequest(PULL_REQUEST.orderHistoryPagination);
    expect(screen.queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Not mergeable yet' })).not.toBeInTheDocument();
  });

  it('offers no merge for a pull request that is closed', async () => {
    await openPullRequest(PULL_REQUEST.legacyDateHelpers);
    expect(screen.queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Not mergeable yet' })).not.toBeInTheDocument();
  });

  it('offers no merge for a merged pull request even when the factory flags it mergeable', async () => {
    const snapshot = withPullRequest(STOREFRONT, PULL_REQUEST.orderHistoryPagination, (pullRequest) => ({ ...pullRequest, mergeable: true, mergeBlockers: [] }));
    await openPullRequest(PULL_REQUEST.orderHistoryPagination, { snapshot });
    expect(screen.queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument();
  });
});

describe('PullRequestsView merge request in the address', () => {
  it('opens the confirmation when the address asks for it, and drops the request from the address', async () => {
    const view = await openPullRequest(SEARCH, {}, STOREFRONT, '?merge=1');
    expect(await screen.findByRole('dialog', { name: MERGE_DIALOG })).toBeInTheDocument();
    await view.expectLocation(pullRequestsPath(STOREFRONT, SEARCH));
    expect(view.transport.commands).toEqual([]);
  });

  it('merges the pull request the address asked about, once the operator confirms', async () => {
    const view = await openPullRequest(SEARCH, {}, STOREFRONT, '?merge=1');
    const dialog = await screen.findByRole('dialog', { name: MERGE_DIALOG });
    await view.user.click(within(dialog).getByRole('button', { name: 'Merge #57' }));
    await expectCommand(view.transport, 'pr.merge', MERGE_BODY);
  });

  it('opens nothing for a pull request that cannot be merged, and still drops the request', async () => {
    const view = await openPullRequest(PULL_REQUEST.checkoutScreenReader, {}, STOREFRONT, '?merge=1');
    await view.expectLocation(pullRequestsPath(STOREFRONT, PULL_REQUEST.checkoutScreenReader));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mergeButton()).toBeDisabled();
  });

  it('opens nothing for a pull request that is already merged', async () => {
    const view = await openPullRequest(PULL_REQUEST.orderHistoryPagination, {}, STOREFRONT, '?merge=1');
    await view.expectLocation(pullRequestsPath(STOREFRONT, PULL_REQUEST.orderHistoryPagination));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens nothing when the address asks to merge without naming a pull request', async () => {
    const view = await renderRoute(pullRequestsPath(STOREFRONT, undefined, '?merge=1'));
    await screen.findByRole('heading', { level: 1, name: 'feat(search): understand colour and price words in the product search' });
    await view.expectLocation(pullRequestsPath(STOREFRONT));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('PullRequestsView merge in French', () => {
  it('asks in French and sends the same command', async () => {
    const view = await openPullRequest(SEARCH, { locale: 'fr' });
    await view.user.click(screen.getByRole('button', { name: 'Merger' }));
    const dialog = await screen.findByRole('dialog', { name: 'Merger #57 ?' });
    expect(within(dialog).getByText('L’usine merge la pull request en squash dans main, uniquement si sa tête est toujours le commit indiqué ci-dessous.')).toBeInTheDocument();
    expect(within(dialog).getByText('4 sur 5 checks réussis')).toBeInTheDocument();
    expect(within(dialog).getByText('Preuves complètes')).toBeInTheDocument();
    await view.user.click(within(dialog).getByRole('button', { name: 'Merger #57' }));
    await expectCommand(view.transport, 'pr.merge', MERGE_BODY);
  });

  it('says in French which failing check the base branch fails too', async () => {
    const view = await openPullRequest(SEARCH, { locale: 'fr', snapshot: failingOnBase(['deploy-preview']) });
    await view.user.click(screen.getByRole('button', { name: 'Merger' }));
    expect(within(await screen.findByRole('dialog', { name: 'Merger #57 ?' })).getByText('4 sur 5 checks réussis · 1 échoue aussi sur la branche de base')).toBeInTheDocument();
  });

  it('says in French which failing checks the base branch fails too, in the plural', async () => {
    const view = await openPullRequest(SEARCH, { locale: 'fr', snapshot: failingOnBase(['deploy-preview', 'lint']) });
    await view.user.click(screen.getByRole('button', { name: 'Merger' }));
    expect(within(await screen.findByRole('dialog', { name: 'Merger #57 ?' })).getByText('3 sur 5 checks réussis · 2 échouent aussi sur la branche de base')).toBeInTheDocument();
  });

  it('lists the blockers under a French title', async () => {
    await openPullRequest(PULL_REQUEST.checkoutScreenReader, { locale: 'fr' });
    expect(screen.getByRole('button', { name: 'Merger' })).toBeDisabled();
    expect(within(screen.getByRole('region', { name: 'Pas encore mergeable' })).getByRole('list', { name: 'Obstacles au merge' })).toBeInTheDocument();
  });
});
