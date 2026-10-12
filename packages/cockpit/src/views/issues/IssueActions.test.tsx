import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand, clickConfirmAndExpectCommand, expectCommand } from '../../test/commands.ts';
import { ISSUE as LEDGER_ISSUE, titleOf as ledgerTitleOf } from '../../test/fixtures/ledger/ids.ts';
import { ISSUE, titleOf } from '../../test/fixtures/storefront/ids.ts';
import { headerOf, LEDGER, openIssue, STOREFRONT, withIssue } from './issue-test-support.ts';

const TITLE_49 = titleOf(ISSUE.promoSavingsSummary);
const buttonsOf = (title: string): (string | null)[] => within(headerOf(title)).queryAllByRole('button').map((button) => button.textContent);
const target = (issueNumber: number, project: string = STOREFRONT) => ({ project, issueNumber });

describe('which commands an issue offers', () => {
  it.each([
    [STOREFRONT, ISSUE.httpTimeoutRegression, ['Validate spec']],
    [STOREFRONT, ISSUE.stockLevelOnProduct, ['Start']],
    [STOREFRONT, ISSUE.deliveryDateEstimate, []],
    [STOREFRONT, ISSUE.expressDelivery, []],
    [STOREFRONT, ISSUE.searchPriceSort, ['Pause']],
    [STOREFRONT, ISSUE.oneClickReorder, ['Pause']],
    [STOREFRONT, ISSUE.savedDeliveryAddress, ['Pause', 'Rewrite a check']],
    [STOREFRONT, ISSUE.orderHistoryStatusFilter, ['Pause', 'Rewrite a check']],
    [STOREFRONT, ISSUE.checkoutScreenReader, ['Pause', 'Rewrite a check']],
    [STOREFRONT, ISSUE.expiredPromoMessage, ['Pause', 'Rewrite a check']],
    [STOREFRONT, ISSUE.naturalLanguageSearch, ['Rewrite a check']],
    [STOREFRONT, ISSUE.promoSavingsSummary, ['Resume at “Implementing”', 'Rewrite a check', 'Abandon']],
    [STOREFRONT, ISSUE.orderHistoryPagination, []],
    [STOREFRONT, ISSUE.legacyDateHelpers, []],
    [STOREFRONT, ISSUE.localSetupDocs, []],
    [LEDGER, LEDGER_ISSUE.creditNotes, ['Validate spec']],
    [LEDGER, LEDGER_ISSUE.overdueGracePeriod, ['Start']],
    [LEDGER, LEDGER_ISSUE.invoiceCsvExport, ['Resume', 'Rewrite a check']],
    [LEDGER, LEDGER_ISSUE.webhookSignatures, ['Pause', 'Rewrite a check']],
  ])('offers on %s issue %i the commands %j', async (project, number, buttons) => {
    await openIssue(number, {}, project);
    expect(buttonsOf(project === LEDGER ? ledgerTitleOf(number) : titleOf(number))).toEqual(buttons);
  });
});

describe('issue.validate-spec', () => {
  it('validates the spec of a draft', async () => {
    const view = await openIssue(ISSUE.httpTimeoutRegression);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Validate spec' }), view.transport, 'issue.validate-spec', target(ISSUE.httpTimeoutRegression));
  });

  it('names the project of the issue', async () => {
    const view = await openIssue(LEDGER_ISSUE.creditNotes, {}, LEDGER);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Validate spec' }), view.transport, 'issue.validate-spec', target(LEDGER_ISSUE.creditNotes, LEDGER));
  });

  it('shows what the factory did, and its refusal', async () => {
    const view = await openIssue(ISSUE.httpTimeoutRegression);
    view.transport.effects.set('issue.validate-spec', 'The spec of issue #75 is validated');
    await view.user.click(screen.getByRole('button', { name: 'Validate spec' }));
    expect(await within(screen.getByRole('status')).findByText('The spec of issue #75 is validated')).toBeInTheDocument();
    view.transport.commandFailure = 'issue #75 is not a valid spec';
    await view.user.click(screen.getByRole('button', { name: 'Validate spec' }));
    const alert = screen.getByRole('alert');
    expect(await within(alert).findByText('The command failed')).toBeInTheDocument();
    expect(within(alert).getByText('issue #75 is not a valid spec')).toBeInTheDocument();
  });

  it('is disabled while the command is in flight', async () => {
    const view = await openIssue(ISSUE.httpTimeoutRegression);
    const release = view.transport.holdCommands();
    await view.user.click(screen.getByRole('button', { name: 'Validate spec' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Validate spec' })).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Validate spec' })).toBeEnabled());
    expect(view.transport.commands).toHaveLength(1);
  });
});

describe('issue.start', () => {
  it('starts a queued issue whose dependencies are merged', async () => {
    const view = await openIssue(ISSUE.stockLevelOnProduct);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Start' }), view.transport, 'issue.start', target(ISSUE.stockLevelOnProduct));
  });

  it('names the project of the issue', async () => {
    const view = await openIssue(LEDGER_ISSUE.overdueGracePeriod, {}, LEDGER);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Start' }), view.transport, 'issue.start', target(LEDGER_ISSUE.overdueGracePeriod, LEDGER));
  });

  it('starts an issue whose dependencies are merged or beyond, or that the project does not hold', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.stockLevelOnProduct, (issue) => ({ ...issue, dependsOn: [ISSUE.orderHistoryPagination, ISSUE.localSetupDocs, 9999] }));
    const view = await openIssue(ISSUE.stockLevelOnProduct, { snapshot });
    const start = screen.getByRole('button', { name: 'Start' });
    expect(start).toBeEnabled();
    await clickAndExpectCommand(view.user, start, view.transport, 'issue.start', target(ISSUE.stockLevelOnProduct));
  });

  it('shows the button disabled and says what the issue waits for while a dependency is not merged', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.stockLevelOnProduct, (issue) => ({ ...issue, dependsOn: [ISSUE.orderHistoryStatusFilter] }));
    const view = await openIssue(ISSUE.stockLevelOnProduct, { snapshot });
    const start = screen.getByRole('button', { name: 'Start' });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription('Waits for #45 to be merged');
    expect(screen.getByText('Waits for #45 to be merged')).toBeInTheDocument();
    await view.user.click(start);
    expect(view.transport.commands).toEqual([]);
  });

  it('names every dependency that is not merged yet, and none that is', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.stockLevelOnProduct, (issue) => ({
      ...issue,
      dependsOn: [ISSUE.orderHistoryStatusFilter, ISSUE.savedDeliveryAddress, ISSUE.orderHistoryPagination],
    }));
    await openIssue(ISSUE.stockLevelOnProduct, { snapshot });
    expect(screen.getByRole('button', { name: 'Start' })).toHaveAccessibleDescription('Waits for #45 and #61 to be merged');
  });

  it('offers no start to an issue that is blocked, since the factory unblocks it by itself', async () => {
    await openIssue(ISSUE.deliveryDateEstimate);
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('shows what the factory did, and its refusal', async () => {
    const view = await openIssue(ISSUE.stockLevelOnProduct);
    view.transport.effects.set('issue.start', 'Issue #77 may start; the daemon picks it up at its next tick');
    await view.user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await within(screen.getByRole('status')).findByText('Issue #77 may start; the daemon picks it up at its next tick')).toBeInTheDocument();
    view.transport.commandFailure = 'issue #77 is not queued';
    await view.user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await within(screen.getByRole('alert')).findByText('issue #77 is not queued')).toBeInTheDocument();
  });

  it('is disabled while the command is in flight', async () => {
    const view = await openIssue(ISSUE.stockLevelOnProduct);
    const release = view.transport.holdCommands();
    await view.user.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled());
  });
});

describe('issue.resume', () => {
  it('resumes an escalated issue where it stopped', async () => {
    const view = await openIssue(ISSUE.promoSavingsSummary);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Resume at “Implementing”' }), view.transport, 'issue.resume', target(ISSUE.promoSavingsSummary));
  });

  it('resumes an issue that was paused', async () => {
    const view = await openIssue(LEDGER_ISSUE.invoiceCsvExport, {}, LEDGER);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Resume' }), view.transport, 'issue.resume', target(LEDGER_ISSUE.invoiceCsvExport, LEDGER));
  });

  it('offers to resume a paused issue that was at work, instead of pausing it', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.orderHistoryStatusFilter, (issue) => ({ ...issue, paused: true }));
    const view = await openIssue(ISSUE.orderHistoryStatusFilter, { snapshot });
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Resume' }), view.transport, 'issue.resume', target(ISSUE.orderHistoryStatusFilter));
  });

  it('offers a single way to resume an issue that is both escalated and paused', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.promoSavingsSummary, (issue) => ({ ...issue, paused: true }));
    const view = await openIssue(ISSUE.promoSavingsSummary, { snapshot });
    expect(within(headerOf(TITLE_49)).getAllByRole('button', { name: /Resume/ })).toHaveLength(1);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Resume at “Implementing”' }), view.transport, 'issue.resume', target(ISSUE.promoSavingsSummary));
  });

  it('names the stage in the language of the page', async () => {
    await openIssue(ISSUE.promoSavingsSummary, { locale: 'fr' });
    expect(screen.getByRole('button', { name: 'Reprendre à « Implémentation »' })).toBeInTheDocument();
  });

  it.each([
    ['queued', ISSUE.stockLevelOnProduct],
    ['closed', ISSUE.localSetupDocs],
    ['in progress and not paused', ISSUE.orderHistoryStatusFilter],
    ['abandoned', ISSUE.legacyDateHelpers],
  ])('is not offered for an issue that is %s', async (_state, number) => {
    await openIssue(number);
    expect(screen.queryByRole('button', { name: /Resume/ })).not.toBeInTheDocument();
  });

  it('shows what the factory did, and its refusal', async () => {
    const view = await openIssue(ISSUE.promoSavingsSummary);
    view.transport.effects.set('issue.resume', 'Issue #49 resumed at implementing');
    await view.user.click(screen.getByRole('button', { name: 'Resume at “Implementing”' }));
    expect(await within(screen.getByRole('status')).findByText('Issue #49 resumed at implementing')).toBeInTheDocument();
    view.transport.commandFailure = 'issue #49 has no resume point';
    await view.user.click(screen.getByRole('button', { name: 'Resume at “Implementing”' }));
    expect(await within(screen.getByRole('alert')).findByText('issue #49 has no resume point')).toBeInTheDocument();
  });

  it('is disabled while the command is in flight', async () => {
    const view = await openIssue(ISSUE.promoSavingsSummary);
    const release = view.transport.holdCommands();
    await view.user.click(screen.getByRole('button', { name: 'Resume at “Implementing”' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume at “Implementing”' })).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume at “Implementing”' })).toBeEnabled());
  });
});

describe('issue.pause', () => {
  it('stops the agent run of an issue at work only after the operator confirmed', async () => {
    const view = await openIssue(ISSUE.orderHistoryStatusFilter);
    await clickConfirmAndExpectCommand(view.user, screen.getByRole('button', { name: 'Pause' }), 'Pause #45?', 'Pause the issue', view.transport, 'issue.pause', target(ISSUE.orderHistoryStatusFilter));
  });

  it('says what pausing does', async () => {
    const view = await openIssue(ISSUE.orderHistoryStatusFilter);
    await view.user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(await screen.findByRole('dialog', { name: 'Pause #45?' })).toHaveTextContent('The agent run in progress on this issue is stopped, and nothing new starts for it until you resume it.');
  });

  it('sends nothing when the operator cancels', async () => {
    const view = await openIssue(ISSUE.orderHistoryStatusFilter);
    await view.user.click(screen.getByRole('button', { name: 'Pause' }));
    await view.user.click(within(await screen.findByRole('dialog', { name: 'Pause #45?' })).getByRole('button', { name: 'Cancel' }));
    expect(view.transport.commands).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the project of the issue, which has the same number as one of another project', async () => {
    const view = await openIssue(LEDGER_ISSUE.webhookSignatures, {}, LEDGER);
    await clickConfirmAndExpectCommand(view.user, screen.getByRole('button', { name: 'Pause' }), 'Pause #19?', 'Pause the issue', view.transport, 'issue.pause', target(LEDGER_ISSUE.webhookSignatures, LEDGER));
  });

  it.each([
    ['queued', ISSUE.stockLevelOnProduct],
    ['a draft', ISSUE.httpTimeoutRegression],
    ['ready to merge', ISSUE.naturalLanguageSearch],
    ['escalated', ISSUE.promoSavingsSummary],
    ['merged', ISSUE.orderHistoryPagination],
    ['abandoned', ISSUE.legacyDateHelpers],
  ])('is not offered for an issue that is %s', async (_state, number) => {
    await openIssue(number);
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });

  it('is not offered for an issue that is already paused', async () => {
    await openIssue(LEDGER_ISSUE.invoiceCsvExport, {}, LEDGER);
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });

  it('shows what the factory did, and keeps the confirmation open on a refusal', async () => {
    const view = await openIssue(ISSUE.orderHistoryStatusFilter);
    view.transport.effects.set('issue.pause', 'Issue #45 paused and its agent run stopped');
    await view.user.click(screen.getByRole('button', { name: 'Pause' }));
    await view.user.click(within(await screen.findByRole('dialog', { name: 'Pause #45?' })).getByRole('button', { name: 'Pause the issue' }));
    expect(await within(screen.getByRole('status')).findByText('Issue #45 paused and its agent run stopped')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    view.transport.commandFailure = 'issue #45 is not running';
    await view.user.click(screen.getByRole('button', { name: 'Pause' }));
    await view.user.click(within(await screen.findByRole('dialog', { name: 'Pause #45?' })).getByRole('button', { name: 'Pause the issue' }));
    expect(await within(screen.getByRole('alert')).findByText('issue #45 is not running')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Pause #45?' })).toBeInTheDocument();
  });

  it('disables the confirmation while the command is in flight', async () => {
    const view = await openIssue(ISSUE.orderHistoryStatusFilter);
    await view.user.click(screen.getByRole('button', { name: 'Pause' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pause #45?' });
    const release = view.transport.holdCommands();
    const confirm = within(dialog).getByRole('button', { name: 'Pause the issue' });
    await view.user.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('issue.abandon', () => {
  async function openDialog(options: Parameters<typeof openIssue>[1] = {}) {
    const view = await openIssue(ISSUE.promoSavingsSummary, options);
    await view.user.click(screen.getByRole('button', { name: 'Abandon' }));
    const dialog = await screen.findByRole('dialog', { name: 'Abandon #49?' });
    return { view, dialog };
  }

  it('asks why, and abandons with the reason trimmed', async () => {
    const { view, dialog } = await openDialog();
    expect(view.transport.commands).toEqual([]);
    expect(dialog).toHaveTextContent('The factory stops working on this issue and releases its worktree.');
    await view.user.type(within(dialog).getByLabelText('Reason'), '   The decision moved to another issue  ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Abandon the issue' }));
    await expectCommand(view.transport, 'issue.abandon', { ...target(ISSUE.promoSavingsSummary), reason: 'The decision moved to another issue' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('refuses an empty reason and a reason made of spaces, and says why', async () => {
    const { view, dialog } = await openDialog();
    expect(within(dialog).queryByText('Give the reason for abandoning this issue.')).not.toBeInTheDocument();
    await view.user.click(within(dialog).getByRole('button', { name: 'Abandon the issue' }));
    expect(within(dialog).getByText('Give the reason for abandoning this issue.')).toBeInTheDocument();
    await view.user.type(within(dialog).getByLabelText('Reason'), '    ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Abandon the issue' }));
    expect(view.transport.commands).toEqual([]);
    expect(screen.getByRole('dialog', { name: 'Abandon #49?' })).toBeInTheDocument();
  });

  it('sends nothing when the operator cancels, and starts again from an empty reason', async () => {
    const { view, dialog } = await openDialog();
    await view.user.type(within(dialog).getByLabelText('Reason'), 'Not now');
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(view.transport.commands).toEqual([]);
    await view.user.click(screen.getByRole('button', { name: 'Abandon' }));
    expect(within(await screen.findByRole('dialog', { name: 'Abandon #49?' })).getByLabelText('Reason')).toHaveValue('');
  });

  it('is offered only for an escalated issue', async () => {
    await openIssue(ISSUE.orderHistoryStatusFilter);
    expect(screen.queryByRole('button', { name: 'Abandon' })).not.toBeInTheDocument();
  });

  it('shows what the factory did, and keeps the dialog open on a refusal', async () => {
    const { view, dialog } = await openDialog();
    view.transport.commandFailure = 'issue #49 cannot be abandoned from this state';
    await view.user.type(within(dialog).getByLabelText('Reason'), 'Not now');
    await view.user.click(within(dialog).getByRole('button', { name: 'Abandon the issue' }));
    expect(await within(screen.getByRole('alert')).findByText('issue #49 cannot be abandoned from this state')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Abandon #49?' })).toBeInTheDocument();
    view.transport.commandFailure = null;
    view.transport.effects.set('issue.abandon', 'Issue #49 abandoned; its worktree was released');
    await view.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Abandon the issue' }));
    expect(await within(screen.getByRole('status')).findByText('Issue #49 abandoned; its worktree was released')).toBeInTheDocument();
  });

  it('disables the confirmation while the command is in flight', async () => {
    const { view, dialog } = await openDialog();
    await view.user.type(within(dialog).getByLabelText('Reason'), 'Not now');
    const release = view.transport.holdCommands();
    const confirm = within(dialog).getByRole('button', { name: 'Abandon the issue' });
    await view.user.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('issue.rewrite-check', () => {
  async function openDialog(number: number = ISSUE.promoSavingsSummary, options: Parameters<typeof openIssue>[1] = {}, project: string = STOREFRONT) {
    const view = await openIssue(number, options, project);
    await view.user.click(screen.getByRole('button', { name: 'Rewrite a check' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rewrite a frozen check' });
    return { view, dialog };
  }

  it('orders the rewrite of the frozen check with the instruction trimmed', async () => {
    const { view, dialog } = await openDialog();
    expect(view.transport.commands).toEqual([]);
    await view.user.type(within(dialog).getByLabelText('Instruction'), '  On the French shop the savings line reads “-4,20 €”.  ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Ask for the rewrite' }));
    await expectCommand(view.transport, 'issue.rewrite-check', {
      ...target(ISSUE.promoSavingsSummary),
      path: 'e2e/cart/promo-savings.spec.ts',
      instruction: 'On the French shop the savings line reads “-4,20 €”.',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('lets the operator choose among the frozen checks', async () => {
    const { view, dialog } = await openDialog(ISSUE.orderHistoryStatusFilter);
    const select = within(dialog).getByLabelText('Check');
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['e2e/orders/status-filter.spec.ts', 'e2e/orders/status-filter-empty.spec.ts']);
    expect(select).toHaveValue('e2e/orders/status-filter.spec.ts');
    await view.user.selectOptions(select, 'e2e/orders/status-filter-empty.spec.ts');
    await view.user.type(within(dialog).getByLabelText('Instruction'), 'Say which status has no order');
    await view.user.click(within(dialog).getByRole('button', { name: 'Ask for the rewrite' }));
    await expectCommand(view.transport, 'issue.rewrite-check', {
      ...target(ISSUE.orderHistoryStatusFilter),
      path: 'e2e/orders/status-filter-empty.spec.ts',
      instruction: 'Say which status has no order',
    });
  });

  it('offers only the checks that are frozen', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.orderHistoryStatusFilter, (issue) => ({
      ...issue,
      checks: issue.checks.map((check, index) => (index === 0 ? { ...check, sha256: null } : check)),
    }));
    const { dialog } = await openDialog(ISSUE.orderHistoryStatusFilter, { snapshot });
    expect(within(within(dialog).getByLabelText('Check')).getAllByRole('option').map((option) => option.textContent)).toEqual(['e2e/orders/status-filter-empty.spec.ts']);
  });

  it('is not offered when no check is frozen', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.orderHistoryStatusFilter, (issue) => ({ ...issue, checks: issue.checks.map((check) => ({ ...check, sha256: null })) }));
    await openIssue(ISSUE.orderHistoryStatusFilter, { snapshot });
    expect(screen.queryByRole('button', { name: 'Rewrite a check' })).not.toBeInTheDocument();
  });

  it.each([
    ['merged', ISSUE.orderHistoryPagination],
    ['closed', ISSUE.localSetupDocs],
    ['abandoned', ISSUE.legacyDateHelpers],
    ['being rewritten already', ISSUE.oneClickReorder],
    ['a draft', ISSUE.httpTimeoutRegression],
    ['writing its checks', ISSUE.searchPriceSort],
  ])('is not offered for an issue that is %s', async (_state, number) => {
    await openIssue(number);
    expect(screen.queryByRole('button', { name: 'Rewrite a check' })).not.toBeInTheDocument();
  });

  it('refuses an empty instruction and one made of spaces, and says why', async () => {
    const { view, dialog } = await openDialog();
    expect(within(dialog).queryByText('Describe what the check must verify.')).not.toBeInTheDocument();
    await view.user.click(within(dialog).getByRole('button', { name: 'Ask for the rewrite' }));
    expect(within(dialog).getByText('Describe what the check must verify.')).toBeInTheDocument();
    await view.user.type(within(dialog).getByLabelText('Instruction'), '   ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Ask for the rewrite' }));
    expect(view.transport.commands).toEqual([]);
    expect(screen.getByRole('dialog', { name: 'Rewrite a frozen check' })).toBeInTheDocument();
  });

  it('sends nothing when the operator cancels', async () => {
    const { view, dialog } = await openDialog();
    await view.user.type(within(dialog).getByLabelText('Instruction'), 'Something');
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(view.transport.commands).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the project of the issue', async () => {
    const { view, dialog } = await openDialog(LEDGER_ISSUE.invoiceCsvExport, {}, LEDGER);
    await view.user.type(within(dialog).getByLabelText('Instruction'), 'Read back a known set of invoices');
    await view.user.click(within(dialog).getByRole('button', { name: 'Ask for the rewrite' }));
    await expectCommand(view.transport, 'issue.rewrite-check', {
      ...target(LEDGER_ISSUE.invoiceCsvExport, LEDGER),
      path: 'tests/test_invoice_csv_export.py',
      instruction: 'Read back a known set of invoices',
    });
  });

  it('shows what the factory did, and keeps the dialog open on a refusal', async () => {
    const { view, dialog } = await openDialog();
    await view.user.type(within(dialog).getByLabelText('Instruction'), 'Something');
    view.transport.commandFailure = 'issue #49 cannot have a check rewritten from this state';
    await view.user.click(within(dialog).getByRole('button', { name: 'Ask for the rewrite' }));
    expect(await within(screen.getByRole('alert')).findByText('issue #49 cannot have a check rewritten from this state')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Rewrite a frozen check' })).toBeInTheDocument();
    view.transport.commandFailure = null;
    view.transport.effects.set('issue.rewrite-check', 'A rewrite of e2e/cart/promo-savings.spec.ts is ordered on issue #49');
    await view.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ask for the rewrite' }));
    expect(await within(screen.getByRole('status')).findByText('A rewrite of e2e/cart/promo-savings.spec.ts is ordered on issue #49')).toBeInTheDocument();
  });

  it('disables the confirmation while the command is in flight', async () => {
    const { view, dialog } = await openDialog();
    await view.user.type(within(dialog).getByLabelText('Instruction'), 'Something');
    const release = view.transport.holdCommands();
    const confirm = within(dialog).getByRole('button', { name: 'Ask for the rewrite' });
    await view.user.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
