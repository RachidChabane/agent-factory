import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand, clickConfirmAndExpectCommand, expectCommand } from '../../test/commands.ts';
import { REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { REQUEST as LEDGER_REQUEST } from '../../test/fixtures/ledger/ids.ts';
import { LEDGER, openRequest, STOREFRONT, withSpec } from './request-test-support.ts';

const SPEC_ONE = 'Show the carrier tracking status on the order page';
const SPEC_TWO = 'Email customers when a parcel is late';
const keepSpec = (title: string) => screen.getByRole('checkbox', { name: `Keep the spec “${title}”` });

describe('request.challenge', () => {
  it('asks the challenger to review a received request', async () => {
    const view = await openRequest(REQUEST.guestCheckout);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Run the challenge' }), view.transport, 'request.challenge', { project: STOREFRONT, requestId: REQUEST.guestCheckout });
  });

  it('offers to challenge again a request that waits for the requester', async () => {
    const view = await openRequest(REQUEST.wishlistSharing);
    expect(screen.queryByRole('button', { name: 'Run the challenge' })).not.toBeInTheDocument();
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Challenge again' }), view.transport, 'request.challenge', { project: STOREFRONT, requestId: REQUEST.wishlistSharing });
  });

  it('names the project, since the same request identifier exists in another project', async () => {
    const view = await openRequest(LEDGER_REQUEST.refundsByEmail, {}, LEDGER);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Run the challenge' }), view.transport, 'request.challenge', { project: LEDGER, requestId: LEDGER_REQUEST.refundsByEmail });
  });

  it('shows what the factory did once it accepted the command', async () => {
    const view = await openRequest(REQUEST.guestCheckout);
    view.transport.effects.set('request.challenge', 'The challenge of request R-13 is queued');
    await view.user.click(screen.getByRole('button', { name: 'Run the challenge' }));
    expect(await within(screen.getByRole('status')).findByText('The challenge of request R-13 is queued')).toBeInTheDocument();
  });

  it('shows the refusal of the factory', async () => {
    const view = await openRequest(REQUEST.guestCheckout);
    view.transport.commandFailure = 'request R-13 is already being challenged';
    await view.user.click(screen.getByRole('button', { name: 'Run the challenge' }));
    const alert = screen.getByRole('alert');
    expect(await within(alert).findByText('The command failed')).toBeInTheDocument();
    expect(within(alert).getByText('request R-13 is already being challenged')).toBeInTheDocument();
  });

  it('is disabled while the command is in flight', async () => {
    const view = await openRequest(REQUEST.guestCheckout);
    const release = view.transport.holdCommands();
    await view.user.click(screen.getByRole('button', { name: 'Run the challenge' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run the challenge' })).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run the challenge' })).toBeEnabled());
    expect(view.transport.commands).toHaveLength(1);
  });

  it.each([
    ['challenging', REQUEST.giftWrapping],
    ['challenged', REQUEST.deliveryTracking],
    ['accepted', REQUEST.orderHistory],
    ['declined', REQUEST.loyaltyPoints],
  ])('is not offered for a request that is %s', async (_state, id) => {
    await openRequest(id);
    expect(screen.queryByRole('button', { name: 'Run the challenge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Challenge again' })).not.toBeInTheDocument();
  });
});

describe('request.decline', () => {
  it.each([
    ['received', REQUEST.guestCheckout],
    ['challenging', REQUEST.giftWrapping],
    ['waiting for the requester', REQUEST.wishlistSharing],
    ['accepted', REQUEST.orderHistory],
    ['declined', REQUEST.loyaltyPoints],
  ])('is not offered for a request that is %s', async (_state, id) => {
    await openRequest(id);
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
  });

  it('asks for the reason before sending anything, and sends it trimmed', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(screen.getByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decline R-15?' });
    expect(view.transport.commands).toEqual([]);
    expect(dialog).toHaveTextContent('The reason is kept with the request. No issue is created.');
    await view.user.type(within(dialog).getByLabelText('Reason'), '  Out of scope for the shop  ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Decline the request' }));
    await expectCommand(view.transport, 'request.decline', { project: STOREFRONT, requestId: REQUEST.deliveryTracking, reason: 'Out of scope for the shop' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('refuses an empty reason and a reason made of spaces, and says why', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(screen.getByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decline R-15?' });
    expect(within(dialog).queryByText('Explain why the request is declined.')).not.toBeInTheDocument();
    await view.user.click(within(dialog).getByRole('button', { name: 'Decline the request' }));
    expect(within(dialog).getByText('Explain why the request is declined.')).toBeInTheDocument();
    await view.user.type(within(dialog).getByLabelText('Reason'), '   ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Decline the request' }));
    expect(view.transport.commands).toEqual([]);
    expect(screen.getByRole('dialog', { name: 'Decline R-15?' })).toBeInTheDocument();
  });

  it('sends nothing when the operator cancels', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(screen.getByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decline R-15?' });
    await view.user.type(within(dialog).getByLabelText('Reason'), 'Not now');
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(view.transport.commands).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('starts from an empty reason each time the dialog is opened', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(screen.getByRole('button', { name: 'Decline' }));
    await view.user.type(within(await screen.findByRole('dialog', { name: 'Decline R-15?' })).getByLabelText('Reason'), 'Not now');
    await view.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await view.user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(within(await screen.findByRole('dialog', { name: 'Decline R-15?' })).getByLabelText('Reason')).toHaveValue('');
  });

  it('names the project of the request', async () => {
    const view = await openRequest(LEDGER_REQUEST.usageBasedBilling, {}, LEDGER);
    await view.user.click(screen.getByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decline R-12?' });
    await view.user.type(within(dialog).getByLabelText('Reason'), 'Pricing is not decided');
    await view.user.click(within(dialog).getByRole('button', { name: 'Decline the request' }));
    await expectCommand(view.transport, 'request.decline', { project: LEDGER, requestId: LEDGER_REQUEST.usageBasedBilling, reason: 'Pricing is not decided' });
  });

  it('shows what the factory did once it accepted the command', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    view.transport.effects.set('request.decline', 'Request R-15 declined');
    await view.user.click(screen.getByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decline R-15?' });
    await view.user.type(within(dialog).getByLabelText('Reason'), 'Not now');
    await view.user.click(within(dialog).getByRole('button', { name: 'Decline the request' }));
    expect(await within(screen.getByRole('status')).findByText('Request R-15 declined')).toBeInTheDocument();
  });

  it('keeps the dialog open and shows the refusal of the factory', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    view.transport.commandFailure = 'request R-15 is not awaiting a decision';
    await view.user.click(screen.getByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decline R-15?' });
    await view.user.type(within(dialog).getByLabelText('Reason'), 'Not now');
    await view.user.click(within(dialog).getByRole('button', { name: 'Decline the request' }));
    expect(await within(screen.getByRole('alert')).findByText('request R-15 is not awaiting a decision')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Decline R-15?' })).toBeInTheDocument();
  });

  it('disables the confirmation while the command is in flight', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(screen.getByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decline R-15?' });
    await view.user.type(within(dialog).getByLabelText('Reason'), 'Not now');
    const release = view.transport.holdCommands();
    const confirm = within(dialog).getByRole('button', { name: 'Decline the request' });
    await view.user.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(view.transport.commands).toHaveLength(1);
  });
});

describe('request.update-spec', () => {
  async function openEditor(specTitle = SPEC_ONE, options: Parameters<typeof openRequest>[1] = {}) {
    const view = await openRequest(REQUEST.deliveryTracking, options);
    await view.user.click(screen.getByRole('button', { name: `Edit the spec “${specTitle}”` }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit the proposed spec' });
    return { view, dialog };
  }

  it('offers to edit each spec of a challenged request', async () => {
    await openRequest(REQUEST.deliveryTracking);
    expect(screen.getByRole('button', { name: `Edit the spec “${SPEC_ONE}”` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Edit the spec “${SPEC_TWO}”` })).toBeInTheDocument();
  });

  it('offers no edit once the request is decided, nor on a spec that already has its issue', async () => {
    await openRequest(REQUEST.orderHistory);
    expect(screen.queryByRole('button', { name: /Edit the spec/ })).not.toBeInTheDocument();
  });

  it('offers no edit while the request waits for the requester', async () => {
    await openRequest(REQUEST.wishlistSharing);
    expect(screen.queryByRole('button', { name: /Edit the spec/ })).not.toBeInTheDocument();
  });

  it('offers no edit on the spec that already became an issue, and still one on the others', async () => {
    const snapshot = withSpec(STOREFRONT, REQUEST.deliveryTracking, 'spec-1', (spec) => ({ ...spec, issueNumber: 99 }));
    await openRequest(REQUEST.deliveryTracking, { snapshot });
    expect(screen.queryByRole('button', { name: `Edit the spec “${SPEC_ONE}”` })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Edit the spec “${SPEC_TWO}”` })).toBeInTheDocument();
  });

  it('opens a form holding the spec as it is', async () => {
    const { dialog } = await openEditor();
    expect(within(dialog).getByLabelText('Title')).toHaveValue(SPEC_ONE);
    expect(within(dialog).getByLabelText('Type')).toHaveValue('ui');
    expect(within(dialog).getByLabelText('Need')).toHaveValue('Customers write to support to ask where their parcel is, because the order page only says "Shipped".');
    expect(within(dialog).getByLabelText('Acceptance criteria')).toHaveValue(
      [
        'The order page of a shipped order shows the latest tracking event of the carrier and the time it happened.',
        'The tracking number links to the carrier’s tracking page in a new tab.',
        'When the carrier does not answer, the page says "Tracking is not available right now" and keeps the rest of the order readable.',
      ].join('\n'),
    );
    expect(within(dialog).getByLabelText('Out of scope')).toHaveValue('Emails about delays\nRating the carrier');
    expect(within(dialog).getByLabelText('Expected proof')).toHaveValue('A browser journey on a shipped order with a recorded carrier answer, with a screenshot of the status block and of the unavailable state.');
  });

  it('offers the types of the project, named in the language of the page', async () => {
    const { dialog } = await openEditor();
    const options = within(within(dialog).getByLabelText('Type')).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(expect.arrayContaining(['Feature', 'Fix', 'UI', 'API', 'Infrastructure and CI', 'Documentation']));
    expect(options).toHaveLength(12);
  });

  it('keeps a type the project does not declare among the choices and selects it', async () => {
    const snapshot = withSpec(STOREFRONT, REQUEST.deliveryTracking, 'spec-1', (spec) => ({ ...spec, type: 'billing' }));
    const { view, dialog } = await openEditor(SPEC_ONE, { snapshot });
    const type = within(dialog).getByLabelText('Type');
    expect(type).toHaveValue('billing');
    expect(within(type).getAllByRole('option')).toHaveLength(13);
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the spec' }));
    await waitFor(() => expect(view.transport.commands).toHaveLength(1));
    expect(view.transport.commands[0]).toMatchObject({ name: 'request.update-spec', body: { spec: { type: 'billing' } } });
  });

  it('sends the rewritten spec with one criterion and one exclusion per non-empty line', async () => {
    const { view, dialog } = await openEditor();
    const title = within(dialog).getByLabelText('Title');
    await view.user.clear(title);
    await view.user.type(title, '  Show the tracking status  ');
    await view.user.selectOptions(within(dialog).getByLabelText('Type'), 'api');
    const need = within(dialog).getByLabelText('Need');
    await view.user.clear(need);
    await view.user.type(need, 'Customers ask where the parcel is.');
    const criteria = within(dialog).getByLabelText('Acceptance criteria');
    await view.user.clear(criteria);
    await view.user.type(criteria, 'The page shows the latest event.{Enter}{Enter}   {Enter}The number links to the carrier.  ');
    await view.user.clear(within(dialog).getByLabelText('Out of scope'));
    const proof = within(dialog).getByLabelText('Expected proof');
    await view.user.clear(proof);
    await view.user.type(proof, 'A browser journey.');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the spec' }));
    await expectCommand(view.transport, 'request.update-spec', {
      project: STOREFRONT,
      requestId: REQUEST.deliveryTracking,
      specId: 'spec-1',
      spec: {
        title: 'Show the tracking status',
        type: 'api',
        need: 'Customers ask where the parcel is.',
        acceptanceCriteria: ['The page shows the latest event.', 'The number links to the carrier.'],
        outOfScope: [],
        expectedProof: 'A browser journey.',
      },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sends the spec as it is when nothing was changed', async () => {
    const { view, dialog } = await openEditor(SPEC_TWO);
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the spec' }));
    await expectCommand(view.transport, 'request.update-spec', {
      project: STOREFRONT,
      requestId: REQUEST.deliveryTracking,
      specId: 'spec-2',
      spec: {
        title: SPEC_TWO,
        type: 'feature',
        need: 'Customers learn about a late parcel only by checking the order page or writing to support.',
        acceptanceCriteria: ['A customer receives one email when the carrier reports that the parcel will arrive late.', 'No second email is sent for the same order.'],
        outOfScope: ['Text messages', 'Changing the promised date'],
        expectedProof: 'Integration tests that feed carrier updates and read the emails sent.',
      },
    });
  });

  it('names the parts of the spec that are missing and sends nothing', async () => {
    const { view, dialog } = await openEditor();
    for (const label of ['Title', 'Need', 'Acceptance criteria', 'Expected proof']) await view.user.clear(within(dialog).getByLabelText(label));
    expect(within(dialog).queryByText('Give the spec a title.')).not.toBeInTheDocument();
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the spec' }));
    expect(within(dialog).getByText('Give the spec a title.')).toBeInTheDocument();
    expect(within(dialog).getByText('State the need.')).toBeInTheDocument();
    expect(within(dialog).getByText('Write at least one acceptance criterion.')).toBeInTheDocument();
    expect(within(dialog).getByText('Say what proof the pull request must carry.')).toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
    expect(screen.getByRole('dialog', { name: 'Edit the proposed spec' })).toBeInTheDocument();
  });

  it('does not take blank lines for a criterion', async () => {
    const { view, dialog } = await openEditor();
    const criteria = within(dialog).getByLabelText('Acceptance criteria');
    await view.user.clear(criteria);
    await view.user.type(criteria, '   {Enter}{Enter}  ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the spec' }));
    expect(within(dialog).getByText('Write at least one acceptance criterion.')).toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('sends nothing when the operator cancels, and forgets the changes', async () => {
    const { view, dialog } = await openEditor();
    const title = within(dialog).getByLabelText('Title');
    await view.user.clear(title);
    await view.user.type(title, 'Something else');
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(view.transport.commands).toEqual([]);
    await view.user.click(screen.getByRole('button', { name: `Edit the spec “${SPEC_ONE}”` }));
    expect(within(await screen.findByRole('dialog', { name: 'Edit the proposed spec' })).getByLabelText('Title')).toHaveValue(SPEC_ONE);
  });

  it('shows what the factory did once it accepted the command', async () => {
    const { view, dialog } = await openEditor();
    view.transport.effects.set('request.update-spec', 'Proposed spec spec-1 of request R-15 saved');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the spec' }));
    expect(await within(screen.getByRole('status')).findByText('Proposed spec spec-1 of request R-15 saved')).toBeInTheDocument();
  });

  it('keeps the form open and shows the refusal of the factory', async () => {
    const { view, dialog } = await openEditor();
    view.transport.commandFailure = 'request R-15 has no proposed spec spec-1';
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the spec' }));
    expect(await within(screen.getByRole('alert')).findByText('request R-15 has no proposed spec spec-1')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit the proposed spec' })).toBeInTheDocument();
  });

  it('disables the save button while the command is in flight', async () => {
    const { view, dialog } = await openEditor();
    const release = view.transport.holdCommands();
    const save = within(dialog).getByRole('button', { name: 'Save the spec' });
    await view.user.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('names the project of the request', async () => {
    const view = await openRequest(LEDGER_REQUEST.usageBasedBilling, {}, LEDGER);
    await view.user.click(screen.getByRole('button', { name: 'Edit the spec “Record usage events per customer”' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit the proposed spec' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the spec' }));
    await waitFor(() => expect(view.transport.commands).toHaveLength(1));
    expect(view.transport.commands[0]).toMatchObject({ name: 'request.update-spec', body: { project: LEDGER, requestId: LEDGER_REQUEST.usageBasedBilling, specId: 'spec-1' } });
  });
});

describe('request.accept', () => {
  it('turns the ticked specs into issues once the operator has seen which ones', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    expect(keepSpec(SPEC_ONE)).toBeChecked();
    expect(keepSpec(SPEC_TWO)).not.toBeChecked();
    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument();
    await view.user.click(screen.getByRole('button', { name: 'Create issues' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create 1 issue?' });
    expect(view.transport.commands).toEqual([]);
    expect(dialog).toHaveTextContent('Each issue is created on the forge and stays a draft until you validate its spec.');
    expect(within(within(dialog).getByRole('list', { name: 'Specs that become issues' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual([SPEC_ONE]);
    await view.user.click(within(dialog).getByRole('button', { name: 'Create the issue' }));
    await expectCommand(view.transport, 'request.accept', { project: STOREFRONT, requestId: REQUEST.deliveryTracking, specIds: ['spec-1'], start: false });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('can also turn a spec with problems into an issue once the operator ticks it', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(keepSpec(SPEC_TWO));
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
    await clickConfirmAndExpectCommand(view.user, screen.getByRole('button', { name: 'Create issues' }), 'Create 2 issues?', 'Create the issues', view.transport, 'request.accept', {
      project: STOREFRONT,
      requestId: REQUEST.deliveryTracking,
      specIds: ['spec-1', 'spec-2'],
      start: false,
    });
  });

  it('sends the ids in the order of the report, whatever the order they were ticked in', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(keepSpec(SPEC_ONE));
    await view.user.click(keepSpec(SPEC_TWO));
    await view.user.click(keepSpec(SPEC_ONE));
    await clickConfirmAndExpectCommand(view.user, screen.getByRole('button', { name: 'Create issues' }), 'Create 2 issues?', 'Create the issues', view.transport, 'request.accept', {
      project: STOREFRONT,
      requestId: REQUEST.deliveryTracking,
      specIds: ['spec-1', 'spec-2'],
      start: false,
    });
  });

  it('sends only the spec that is ticked', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(keepSpec(SPEC_ONE));
    await view.user.click(keepSpec(SPEC_TWO));
    await clickConfirmAndExpectCommand(view.user, screen.getByRole('button', { name: 'Create issues' }), 'Create 1 issue?', 'Create the issue', view.transport, 'request.accept', {
      project: STOREFRONT,
      requestId: REQUEST.deliveryTracking,
      specIds: ['spec-2'],
      start: false,
    });
  });

  it('cannot be asked for without a spec ticked', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(keepSpec(SPEC_ONE));
    const create = screen.getByRole('button', { name: 'Create issues' });
    expect(create).toBeDisabled();
    expect(screen.getByText('0 of 2 selected')).toBeInTheDocument();
    await view.user.click(create);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('sends nothing when the operator cancels the confirmation', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(screen.getByRole('button', { name: 'Create issues' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create 1 issue?' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(view.transport.commands).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(keepSpec(SPEC_ONE)).toBeChecked();
  });

  it('never sends a spec that already has its issue, and leaves the others to tick', async () => {
    const snapshot = withSpec(STOREFRONT, REQUEST.deliveryTracking, 'spec-1', (spec) => ({ ...spec, issueNumber: 99 }));
    const view = await openRequest(REQUEST.deliveryTracking, { snapshot });
    expect(screen.queryByRole('checkbox', { name: `Keep the spec “${SPEC_ONE}”` })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Issue #99' })).toHaveAttribute('href', `/projects/${STOREFRONT}/issues/99`);
    expect(screen.getByText('0 of 1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create issues' })).toBeDisabled();
    await view.user.click(keepSpec(SPEC_TWO));
    await clickConfirmAndExpectCommand(view.user, screen.getByRole('button', { name: 'Create issues' }), 'Create 1 issue?', 'Create the issue', view.transport, 'request.accept', {
      project: STOREFRONT,
      requestId: REQUEST.deliveryTracking,
      specIds: ['spec-2'],
      start: false,
    });
  });

  it('names the project of the request', async () => {
    const view = await openRequest(LEDGER_REQUEST.usageBasedBilling, {}, LEDGER);
    await clickConfirmAndExpectCommand(view.user, screen.getByRole('button', { name: 'Create issues' }), 'Create 1 issue?', 'Create the issue', view.transport, 'request.accept', {
      project: LEDGER,
      requestId: LEDGER_REQUEST.usageBasedBilling,
      specIds: ['spec-1'],
      start: false,
    });
  });

  it('shows what the factory did once it accepted the command', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    view.transport.effects.set('request.accept', 'Issue(s) #81 created on storefront');
    await view.user.click(screen.getByRole('button', { name: 'Create issues' }));
    await view.user.click(within(await screen.findByRole('dialog', { name: 'Create 1 issue?' })).getByRole('button', { name: 'Create the issue' }));
    expect(await within(screen.getByRole('status')).findByText('Issue(s) #81 created on storefront')).toBeInTheDocument();
  });

  it('keeps the confirmation open and shows the refusal of the factory', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    view.transport.commandFailure = 'The spec file cannot become an issue: the type is unknown';
    await view.user.click(screen.getByRole('button', { name: 'Create issues' }));
    await view.user.click(within(await screen.findByRole('dialog', { name: 'Create 1 issue?' })).getByRole('button', { name: 'Create the issue' }));
    expect(await within(screen.getByRole('alert')).findByText('The spec file cannot become an issue: the type is unknown')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Create 1 issue?' })).toBeInTheDocument();
  });

  it('disables the confirmation while the command is in flight', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(screen.getByRole('button', { name: 'Create issues' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create 1 issue?' });
    const release = view.transport.holdCommands();
    const confirm = within(dialog).getByRole('button', { name: 'Create the issue' });
    await view.user.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(view.transport.commands).toHaveLength(1);
  });

  it.each([
    ['accepted', REQUEST.orderHistory],
    ['waiting for the requester', REQUEST.wishlistSharing],
    ['declined', REQUEST.loyaltyPoints],
    ['received', REQUEST.guestCheckout],
  ])('is not offered for a request that is %s, and the specs cannot be ticked', async (_state, id) => {
    await openRequest(id);
    expect(screen.queryByRole('button', { name: /^Create .*issue/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/ selected$/)).not.toBeInTheDocument();
  });

  it('words the button and the dialog in French, with the singular, the plural and the empty form', async () => {
    const view = await openRequest(REQUEST.deliveryTracking, { locale: 'fr' });
    await view.user.click(screen.getByRole('checkbox', { name: `Retenir la spec « ${SPEC_TWO} »` }));
    await view.user.click(screen.getByRole('button', { name: 'Créer les issues' }));
    const dialog = await screen.findByRole('dialog', { name: 'Créer 2 issues ?' });
    expect(within(dialog).getByRole('button', { name: 'Créer les issues' })).toBeInTheDocument();
    await view.user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await view.user.click(screen.getByRole('checkbox', { name: `Retenir la spec « ${SPEC_ONE} »` }));
    await view.user.click(screen.getByRole('checkbox', { name: `Retenir la spec « ${SPEC_TWO} »` }));
    expect(screen.getByRole('button', { name: 'Créer les issues' })).toBeDisabled();
  });
  it('also offers to create the issues and start them, as the explicit order of the operator', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(screen.getByRole('button', { name: 'Create and start' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create 1 issue and start it?' });
    expect(view.transport.commands).toEqual([]);
    expect(dialog).toHaveTextContent('This is your order to start: each issue is created on the forge with its spec already validated');
    expect(within(within(dialog).getByRole('list', { name: 'Specs that become issues' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual([SPEC_ONE]);
    await view.user.click(within(dialog).getByRole('button', { name: 'Create and start the issue' }));
    await expectCommand(view.transport, 'request.accept', { project: STOREFRONT, requestId: REQUEST.deliveryTracking, specIds: ['spec-1'], start: true });
  });

  it('starts every ticked spec when several are chosen', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(keepSpec(SPEC_TWO));
    await clickConfirmAndExpectCommand(
      view.user,
      screen.getByRole('button', { name: 'Create and start' }),
      'Create 2 issues and start them?',
      'Create and start the issues',
      view.transport,
      'request.accept',
      { project: STOREFRONT, requestId: REQUEST.deliveryTracking, specIds: ['spec-1', 'spec-2'], start: true },
    );
  });

  it('cannot start anything without a spec ticked', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    await view.user.click(keepSpec(SPEC_ONE));
    const start = screen.getByRole('button', { name: 'Create and start' });
    expect(start).toBeDisabled();
    await view.user.click(start);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('shows what the factory did when the issues were created and started', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    view.transport.effects.set('request.accept', 'Issue(s) #81 created on storefront and validated');
    await view.user.click(screen.getByRole('button', { name: 'Create and start' }));
    await view.user.click(within(await screen.findByRole('dialog', { name: 'Create 1 issue and start it?' })).getByRole('button', { name: 'Create and start the issue' }));
    expect(await within(screen.getByRole('status')).findByText('Issue(s) #81 created on storefront and validated')).toBeInTheDocument();
  });

  it('writes both actions in French', async () => {
    await openRequest(REQUEST.deliveryTracking, { locale: 'fr' });
    expect(screen.getByRole('button', { name: 'Créer les issues' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer et démarrer' })).toBeInTheDocument();
  });
});
