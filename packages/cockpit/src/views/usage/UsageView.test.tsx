import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand } from '../../test/commands.ts';
import { TEST_NOW } from '../../test/harness.tsx';
import { MINUTE_MS } from '../../i18n/formatters.ts';
import { accountCard, minutesAgo, renderUsage, SNAPSHOT, withAccounts, withLimit } from './usage-test-support.tsx';

describe('UsageView accounts', () => {
  it('lists each account with its billing, and says how often usage is read', async () => {
    await renderUsage();
    const accounts = within(screen.getByRole('list', { name: 'Accounts' }));
    expect(accounts.getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(['personal', 'shared']);
    expect(accountCard('personal').getByText('Subscription')).toBeInTheDocument();
    expect(accountCard('shared').getByText('API key')).toBeInTheDocument();
    expect(screen.getByText('Usage is read every 15 min. A reading older than 45 min is shown as stale.')).toBeInTheDocument();
  });

  it('names who the account is logged in as: the email, the organization and the plan', async () => {
    await renderUsage();
    expect(accountCard('personal').getByRole('heading', { level: 3 })).toHaveTextContent('personal — alex.morgan@example.com · example-org · Max plan');
  });

  it('leaves out what the usage report did not name, without any placeholder', async () => {
    await renderUsage(withAccounts((account) => ({ ...account, identity: { email: 'alex.morgan@example.com', organization: null, plan: null } }), 'personal'));
    const heading = accountCard('personal').getByRole('heading', { level: 3 });
    expect(heading).toHaveTextContent(/^personal — alex\.morgan@example\.com$/);
  });

  it('says the login is unknown when no usage report named the account', async () => {
    await renderUsage();
    expect(accountCard('shared').getByRole('heading', { level: 3 })).toHaveTextContent('shared — login unknown');
  });

  it('says the login is unknown when the report named none of its parts', async () => {
    await renderUsage(withAccounts((account) => ({ ...account, identity: { email: null, organization: null, plan: null } }), 'personal'));
    expect(accountCard('personal').getByRole('heading', { level: 3 })).toHaveTextContent('personal — login unknown');
  });

  it('says where the reading came from and how long ago', async () => {
    await renderUsage();
    const personal = accountCard('personal');
    expect(personal.getByText('Source: Usage report')).toBeInTheDocument();
    const age = personal.getByText('Read 6 min. ago');
    expect(age).toHaveAttribute('datetime', '2026-10-12T09:54:00.000Z');
    expect(age).toHaveAttribute('title', 'October 12, 2026 at 9:54:00 AM UTC');
    expect(personal.queryByTitle(/Read more than/)).not.toBeInTheDocument();
  });

  it('marks the reading of an account stale once it is older than the cockpit allows', async () => {
    await renderUsage(withAccounts((account) => ({ ...account, readAt: minutesAgo(50) }), 'personal'));
    expect(accountCard('personal').getByTitle('Read more than 45 min ago, so it may no longer be current.')).toHaveTextContent('Stale');
  });

  it('spells out a failed read beside the value it left in place', async () => {
    await renderUsage(withAccounts((account) => ({ ...account, lastFailure: { at: minutesAgo(2), reason: 'rate limited' } }), 'personal'));
    const personal = accountCard('personal');
    expect(personal.getByRole('note')).toHaveTextContent('The last read failed (rate limited). This is the value read 6 min. ago.');
    expect(personal.getByRole('meter', { name: 'Utilization of Session' })).toBeInTheDocument();
    expect(personal.queryByText(/Last failure/)).not.toBeInTheDocument();
  });

  it('keeps a failure older than the last reading as history, not as a warning', async () => {
    await renderUsage(withAccounts((account) => ({ ...account, lastFailure: { at: minutesAgo(30), reason: 'rate limited' } }), 'personal'));
    const personal = accountCard('personal');
    expect(personal.getByText(/^Last failure/)).toHaveTextContent('Last failure 30 min. ago: rate limited');
    expect(personal.queryByRole('note')).not.toBeInTheDocument();
  });

  it('says an account billed by API key was never read and why it lists no limit', async () => {
    await renderUsage();
    const shared = accountCard('shared');
    expect(shared.getByText('Not read yet')).toBeInTheDocument();
    expect(shared.getByRole('note')).toHaveTextContent('The last read failed: The usage report is not available for an account billed by API key.');
    expect(shared.getByText('No usage limit reported')).toBeInTheDocument();
    expect(shared.getByText('An account billed by API key has no subscription limit to read.')).toBeInTheDocument();
    expect(shared.queryByText(/Source:/)).not.toBeInTheDocument();
  });

  it('says a subscription account that was never read has no known limit', async () => {
    const snapshot = withAccounts((account) => ({ ...account, limits: [], source: null, readAt: null, lastFailure: null }), 'personal');
    await renderUsage(snapshot);
    expect(accountCard('personal').getByText('This account has never been read, so none of its limits is known.')).toBeInTheDocument();
  });

  it('says a subscription account whose last reading listed nothing reported no limit', async () => {
    await renderUsage(withAccounts((account) => ({ ...account, limits: [] }), 'personal'));
    expect(accountCard('personal').getByText('The last reading listed no limit for this account.')).toBeInTheDocument();
  });

  it('says so when no account reports usage', async () => {
    await renderUsage({ ...SNAPSHOT, usage: { ...SNAPSHOT.usage, accounts: [] } });
    expect(screen.getByText('No account reports usage')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Accounts' })).not.toBeInTheDocument();
  });
});

describe('UsageView limits', () => {
  it('shows a fresh limit as a meter with the point where the factory pauses and the reset time', async () => {
    await renderUsage();
    const session = screen.getByRole('meter', { name: 'Utilization of Session' });
    expect(session).toHaveAttribute('aria-valuenow', '42');
    expect(session).toHaveAttribute('aria-valuetext', '42%');
    const card = accountCard('personal');
    expect(card.getAllByText('The factory pauses at 90%')).toHaveLength(1);
    expect(card.getAllByText('The factory pauses at 85%')).toHaveLength(2);
    expect(card.getByText('in 2 hr.')).toHaveAttribute('datetime', '2026-10-12T12:12:00.000Z');
    expect(card.getByText('Oct 12, 2026, 12:12 PM')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Utilization of Weekly, all models' })).toHaveAttribute('aria-valuenow', '63');
  });

  it('shows the model a scoped limit applies to', async () => {
    await renderUsage();
    const card = accountCard('personal');
    expect(card.getAllByText('claude-opus-5-5')).not.toHaveLength(0);
    expect(card.getAllByText(/^Weekly, one model/)).toHaveLength(2);
    expect(screen.getByRole('meter', { name: 'Utilization of Weekly, one model · claude-opus-5-5' })).toHaveAttribute('aria-valuenow', '71');
  });

  it('marks a stale limit as such and still shows its last value', async () => {
    await renderUsage();
    const card = accountCard('personal');
    expect(card.getByText('Stale')).toHaveAttribute('title', 'Read a while ago: this figure may no longer be current.');
    expect(screen.getByRole('meter', { name: /claude-opus-5-5/ })).toBeInTheDocument();
    expect(card.getByText('71%')).toBeInTheDocument();
  });

  it('never shows the old percentage of a window that was reset as current', async () => {
    await renderUsage();
    const card = accountCard('personal');
    expect(screen.queryByRole('meter', { name: /claude-sonnet-5-5/ })).not.toBeInTheDocument();
    expect(card.getByText('Window reset')).toBeInTheDocument();
    expect(card.getByText(/^This window was reset/)).toHaveTextContent('This window was reset 20 min. ago.');
    expect(card.getByText(/^This window was reset/).closest('li')).toHaveTextContent('Weekly, one model · claude-sonnet-5-5');
    expect(card.getByText('Its current utilization is unknown until the next reading.')).toBeInTheDocument();
    const previous = card.getByText(/^Previous window:/);
    expect(within(previous).getByText('38%').tagName).toBe('S');
    expect(card.getAllByText('38%')).toHaveLength(1);
    expect(screen.queryByRole('meter', { name: (_name, element) => element.getAttribute('aria-valuenow') === '38' })).not.toBeInTheDocument();
  });

  it('treats a limit as reset once its reset time has passed, whatever freshness the snapshot gave it', async () => {
    await renderUsage(withLimit('session', null, (limit) => ({ ...limit, resetsAt: minutesAgo(5) })));
    expect(screen.queryByRole('meter', { name: 'Utilization of Session' })).not.toBeInTheDocument();
    const card = accountCard('personal');
    expect(card.getAllByText('Window reset')).toHaveLength(2);
    expect(card.getByText('42%').tagName).toBe('S');
  });

  it('shows when a reset window resets next, if the reading says so', async () => {
    await renderUsage(withLimit('weekly_scoped', 'claude-sonnet-5-5', (limit) => ({ ...limit, freshness: 'window-reset', resetsAt: new Date(TEST_NOW + 3 * 60 * MINUTE_MS).toISOString() })));
    const card = accountCard('personal');
    expect(screen.queryByRole('meter', { name: /claude-sonnet-5-5/ })).not.toBeInTheDocument();
    expect(card.getByText('in 3 hr.')).toBeInTheDocument();
  });

  it('says the reset time is not reported when the reading gives none', async () => {
    await renderUsage(withLimit('session', null, (limit) => ({ ...limit, resetsAt: null })));
    expect(accountCard('personal').getByText('Reset time not reported')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Utilization of Session' })).toBeInTheDocument();
  });

  it('shows a limit above its pause threshold with the figure it reads', async () => {
    await renderUsage(withLimit('session', null, (limit) => ({ ...limit, utilization: 0.93 })));
    expect(screen.getByRole('meter', { name: 'Utilization of Session' })).toHaveAttribute('aria-valuenow', '93');
    expect(accountCard('personal').getByText('93%')).toBeInTheDocument();
  });
});

describe('usage.refresh', () => {
  const refreshButton = () => screen.getByRole('button', { name: 'Refresh usage' });

  it('reads the usage again on order', async () => {
    const view = await renderUsage();
    await clickAndExpectCommand(view.user, refreshButton(), view.transport, 'usage.refresh', {});
  });

  it('shows what the factory did, and its refusal', async () => {
    const view = await renderUsage();
    view.transport.effects.set('usage.refresh', 'Subscription usage read for 2 account(s)');
    await view.user.click(refreshButton());
    expect(await screen.findByText('Subscription usage read for 2 account(s)')).toBeInTheDocument();
    view.transport.commandFailure = 'the usage report is not available right now';
    await view.user.click(refreshButton());
    expect(await within(screen.getByRole('alert')).findByText('the usage report is not available right now')).toBeInTheDocument();
  });

  it('is disabled while the command is in flight', async () => {
    const view = await renderUsage();
    const release = view.transport.holdCommands();
    await view.user.click(refreshButton());
    await waitFor(() => expect(refreshButton()).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(refreshButton()).toBeEnabled());
    expect(view.transport.commands).toHaveLength(1);
  });

  it('is the only command the page sends', async () => {
    const view = await renderUsage();
    for (const button of screen.getAllByRole('button')) {
      if (button.textContent !== 'Refresh usage') await view.user.click(button);
    }
    expect(view.transport.commands).toEqual([]);
  });
});

describe('UsageView in French', () => {
  it('words the subscription accounts and their limits in French', async () => {
    await renderUsage(SNAPSHOT, 'fr');
    const personal = accountCard('personal');
    expect(personal.getByRole('heading', { level: 3 })).toHaveTextContent('personal — alex.morgan@example.com · example-org · forfait Max');
    expect(personal.getByText('Source : Rapport d’usage')).toBeInTheDocument();
    expect(personal.getByText('Fenêtre réinitialisée')).toBeInTheDocument();
    expect(personal.getByText(/^Fenêtre précédente/)).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Utilisation : Session' })).toBeInTheDocument();
    expect(accountCard('shared').getByRole('heading', { level: 3 })).toHaveTextContent('shared — connexion inconnue');
    expect(accountCard('shared').getByText('Aucune limite d’usage remontée')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualiser l’usage' })).toBeInTheDocument();
  });
});
