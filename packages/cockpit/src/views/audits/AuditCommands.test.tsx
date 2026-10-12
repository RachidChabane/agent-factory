import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand, expectCommand } from '../../test/commands.ts';
import { AUDIT, LEDGER, openAudit, short, STOREFRONT, withAudit } from './audit-test-support.ts';

const PROMO = AUDIT.promoBanner;
const NOTE = 'The banner copy comes from the promo rules; the test covers the sale exclusion.';
const RESOLVE_DIALOG = `Mark ${short(PROMO)} as resolved?`;

const publishButton = () => screen.getByRole('button', { name: 'Publish the audit issue' });
const resolveButton = () => screen.getByRole('button', { name: 'Mark as resolved' });
const queryPublish = () => screen.queryByRole('button', { name: 'Publish the audit issue' });
const queryResolve = () => screen.queryByRole('button', { name: 'Mark as resolved' });
const noteField = (dialog: HTMLElement) => within(dialog).getByLabelText('Resolution note');
const confirmButton = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Mark as resolved' });

async function openResolveDialog(view: Awaited<ReturnType<typeof openAudit>>): Promise<HTMLElement> {
  await view.user.click(resolveButton());
  return screen.findByRole('dialog', { name: RESOLVE_DIALOG });
}

describe('AuditsView publish the audit issue', () => {
  it('publishes the drafted issue on order', async () => {
    const view = await openAudit(PROMO);
    await clickAndExpectCommand(view.user, publishButton(), view.transport, 'audit.publish-issue', { project: STOREFRONT, auditId: PROMO });
  });

  it('shows what the factory did once the issue is published', async () => {
    const view = await openAudit(PROMO);
    view.transport.effects.set('audit.publish-issue', 'Issue #81 opened from the audit of 1d52ca9');
    await view.user.click(publishButton());
    expect(await within(screen.getByRole('status')).findByText('Issue #81 opened from the audit of 1d52ca9')).toBeInTheDocument();
  });

  it('shows the refusal of the factory', async () => {
    const view = await openAudit(PROMO);
    view.transport.commandFailure = 'the audit has no issue draft';
    await view.user.click(publishButton());
    expect(await within(screen.getByRole('alert')).findByText('the audit has no issue draft')).toBeInTheDocument();
  });

  it('is disabled while the issue is being published, and sends it only once', async () => {
    const view = await openAudit(PROMO);
    const release = view.transport.holdCommands();
    await view.user.click(publishButton());
    await waitFor(() => expect(publishButton()).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(publishButton()).toBeEnabled());
    expect(view.transport.commands).toHaveLength(1);
  });

  it('publishes the issue of an audit of the ledger in the ledger', async () => {
    const view = await openAudit(AUDIT.ledgerRewrite, {}, LEDGER);
    await clickAndExpectCommand(view.user, publishButton(), view.transport, 'audit.publish-issue', { project: LEDGER, auditId: AUDIT.ledgerRewrite });
  });

  it.each([
    ['an audit whose issue is published and which is resolved', AUDIT.httpClient],
    ['a change that was kept', AUDIT.footerLinks],
    ['an audit that is under way', AUDIT.doubleSubmit],
    ['a change just detected', AUDIT.lockfile],
  ])('offers no publication for %s', async (_name, auditId) => {
    await openAudit(auditId);
    expect(queryPublish()).not.toBeInTheDocument();
  });

  it('offers no publication when the issue was already published, though the verdict is not resolved', async () => {
    await openAudit(PROMO, { snapshot: withAudit(STOREFRONT, PROMO, (audit) => ({ ...audit, publishedIssueNumber: 81 })) });
    expect(queryPublish()).not.toBeInTheDocument();
    expect(resolveButton()).toBeInTheDocument();
  });

  it('offers no publication when the auditor drafted no issue, though the verdict is not resolved', async () => {
    await openAudit(PROMO, { snapshot: withAudit(STOREFRONT, PROMO, (audit) => ({ ...audit, draft: null })) });
    expect(queryPublish()).not.toBeInTheDocument();
    expect(resolveButton()).toBeInTheDocument();
  });
});

describe('AuditsView resolve', () => {
  it('asks for a note before sending anything', async () => {
    const view = await openAudit(PROMO);
    const dialog = await openResolveDialog(view);
    expect(within(dialog).getByText('The note stays with the audit. A resolved audit does not hold back the release gate.')).toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
    await view.user.click(confirmButton(dialog));
    expect(within(dialog).getByText('Write how the audit was resolved.')).toBeInTheDocument();
    expect(noteField(dialog)).toHaveAccessibleDescription('Write how the audit was resolved.');
    expect(view.transport.commands).toEqual([]);
    expect(screen.getByRole('dialog', { name: RESOLVE_DIALOG })).toBeInTheDocument();
  });

  it('puts the cursor in the note', async () => {
    const view = await openAudit(PROMO);
    const dialog = await openResolveDialog(view);
    expect(noteField(dialog)).toHaveFocus();
  });

  it('treats a note made of blanks as missing', async () => {
    const view = await openAudit(PROMO);
    const dialog = await openResolveDialog(view);
    await view.user.type(noteField(dialog), '   ');
    await view.user.click(confirmButton(dialog));
    expect(within(dialog).getByText('Write how the audit was resolved.')).toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('resolves the audit with the note, trimmed', async () => {
    const view = await openAudit(PROMO);
    const dialog = await openResolveDialog(view);
    await view.user.type(noteField(dialog), `  ${NOTE}  `);
    await view.user.click(confirmButton(dialog));
    await expectCommand(view.transport, 'audit.resolve', { project: STOREFRONT, auditId: PROMO, note: NOTE });
  });

  it('shows what the factory did and closes the dialog once the audit is resolved', async () => {
    const view = await openAudit(PROMO);
    view.transport.effects.set('audit.resolve', 'The audit of 1d52ca9 is resolved');
    const dialog = await openResolveDialog(view);
    await view.user.type(noteField(dialog), NOTE);
    await view.user.click(confirmButton(dialog));
    expect(await within(screen.getByRole('status')).findByText('The audit of 1d52ca9 is resolved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the dialog and the note, and shows the reason, when the factory refuses', async () => {
    const view = await openAudit(PROMO);
    view.transport.commandFailure = 'audit 1d52ca9 was not found';
    const dialog = await openResolveDialog(view);
    await view.user.type(noteField(dialog), NOTE);
    await view.user.click(confirmButton(dialog));
    expect(await within(screen.getByRole('alert')).findByText('audit 1d52ca9 was not found')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: RESOLVE_DIALOG })).toBeInTheDocument();
    expect(noteField(dialog)).toHaveValue(NOTE);
  });

  it('is disabled while the audit is being resolved, and sends it only once', async () => {
    const view = await openAudit(PROMO);
    const release = view.transport.holdCommands();
    const dialog = await openResolveDialog(view);
    await view.user.type(noteField(dialog), NOTE);
    await view.user.click(confirmButton(dialog));
    await waitFor(() => expect(confirmButton(dialog)).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(view.transport.commands).toHaveLength(1);
  });

  it('sends nothing when the operator cancels', async () => {
    const view = await openAudit(PROMO);
    const dialog = await openResolveDialog(view);
    await view.user.type(noteField(dialog), NOTE);
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(view.transport.commands).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the dialog from the keyboard', async () => {
    const view = await openAudit(PROMO);
    resolveButton().focus();
    await view.user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: RESOLVE_DIALOG })).toBeInTheDocument();
  });

  it('resolves an audit of the ledger in the ledger', async () => {
    const view = await openAudit(AUDIT.ledgerRewrite, {}, LEDGER);
    await view.user.click(resolveButton());
    const dialog = await screen.findByRole('dialog', { name: `Mark ${short(AUDIT.ledgerRewrite)} as resolved?` });
    await view.user.type(noteField(dialog), NOTE);
    await view.user.click(confirmButton(dialog));
    await expectCommand(view.transport, 'audit.resolve', { project: LEDGER, auditId: AUDIT.ledgerRewrite, note: NOTE });
  });

  it.each([
    ['an audit that is resolved', AUDIT.httpClient],
    ['a change that was kept', AUDIT.footerLinks],
    ['an audit that is under way', AUDIT.doubleSubmit],
    ['a change just detected', AUDIT.lockfile],
  ])('offers no resolution for %s', async (_name, auditId) => {
    await openAudit(auditId);
    expect(queryResolve()).not.toBeInTheDocument();
  });
});

describe('AuditsView commands in French', () => {
  it('words the actions and the dialog in French and sends the same commands', async () => {
    const view = await openAudit(PROMO, { locale: 'fr' });
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Publier l’issue d’audit' }), view.transport, 'audit.publish-issue', { project: STOREFRONT, auditId: PROMO });
    await view.user.click(screen.getByRole('button', { name: 'Marquer comme résolu' }));
    const dialog = await screen.findByRole('dialog', { name: `Marquer ${short(PROMO)} comme résolu ?` });
    await view.user.click(within(dialog).getByRole('button', { name: 'Marquer comme résolu' }));
    expect(within(dialog).getByText('Notez comment l’audit a été résolu.')).toBeInTheDocument();
    await view.user.type(within(dialog).getByLabelText('Note de résolution'), NOTE);
    await view.user.click(within(dialog).getByRole('button', { name: 'Marquer comme résolu' }));
    await waitFor(() => expect(view.transport.commands).toHaveLength(2));
    expect(view.transport.commands[1]).toEqual({ name: 'audit.resolve', body: { project: STOREFRONT, auditId: PROMO, note: NOTE } });
  });
});
