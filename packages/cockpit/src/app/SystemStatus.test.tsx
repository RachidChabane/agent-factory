import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { UsageAccountView } from '../contract/index.ts';
import { fixtureSnapshot, renderApp, TEST_NOW } from '../test/render.tsx';

const LABEL = 'Machine, run slots and subscription usage';

async function openStatus(options: Parameters<typeof renderApp>[1] = {}) {
  const view = await renderApp('/', options);
  const trigger = screen.getByRole('button', { name: options.locale === 'fr' ? 'Machine, créneaux de run et usage de l’abonnement' : LABEL });
  return { view, trigger, open: async () => {
    await view.user.click(trigger);
    return screen.findByRole('dialog', { name: options.locale === 'fr' ? 'Machine, créneaux de run et usage de l’abonnement' : LABEL });
  } };
}

describe('SystemStatus gauges', () => {
  it('shows the free memory, the run slots and the highest usage that can be trusted', async () => {
    const { trigger } = await openStatus();
    expect(within(trigger).getByRole('meter', { name: 'Free memory' })).toHaveAttribute('aria-valuetext', '63%');
    expect(trigger).toHaveTextContent('Run slots 2/3');
    expect(trigger).toHaveTextContent('Usage63%');
  });

  it('shows no usage figure when no limit has a current reading', async () => {
    const base = fixtureSnapshot();
    const stale: UsageAccountView[] = base.usage.accounts.map((account) => ({ ...account, limits: account.limits.map((limit) => ({ ...limit, freshness: 'stale' as const })) }));
    const { trigger } = await openStatus({ snapshot: { ...base, usage: { ...base.usage, accounts: stale } } });
    expect(trigger).not.toHaveTextContent('Usage');
  });

  it('shows no memory figure when no sample was ever read', async () => {
    const base = fixtureSnapshot();
    const { trigger } = await openStatus({ snapshot: { ...base, resources: { ...base.resources, sample: { value: null, readAt: null, error: null } } } });
    expect(within(trigger).queryByRole('meter', { name: 'Free memory' })).not.toBeInTheDocument();
  });
});

describe('SystemStatus popover', () => {
  it('reports the machine, with when it was sampled and why scheduling is suspended', async () => {
    const { open } = await openStatus();
    const popover = await open();
    expect(within(popover).getByText('Free memory').closest('div')).toHaveTextContent('63%');
    expect(within(popover).getByText(/Pressure normal · threshold 40% · new runs are suspended/)).toBeInTheDocument();
    expect(within(popover).getByText(/^Read just now/)).toBeInTheDocument();
  });

  it('reports the run slots in use and the queue', async () => {
    const { open } = await openStatus();
    const popover = await open();
    expect(within(popover).getByText('2 of 3 in use')).toBeInTheDocument();
    expect(within(popover).getByText('1 queued')).toBeInTheDocument();
  });

  it('shows each limit of an account with its current utilization, and says when a reading cannot be trusted', async () => {
    const { open } = await openStatus();
    const popover = await open();
    const account = within(popover).getByText('personal').closest('div') as HTMLElement;
    expect(within(account).getByText('Session').closest('div')).toHaveTextContent('42%');
    expect(within(account).getByText('Weekly, all models').closest('div')).toHaveTextContent('63%');
    const opus = within(account).getByText('Weekly, one model · claude-opus-5-5').closest('div');
    expect(opus).toHaveTextContent('Stale');
    expect(opus).not.toHaveTextContent('71%');
    const sonnet = within(account).getByText('Weekly, one model · claude-sonnet-5-5').closest('div');
    expect(sonnet).toHaveTextContent('Window reset');
    expect(sonnet).not.toHaveTextContent('38%');
    expect(within(account).getByText(/^Read 6 min/)).toBeInTheDocument();
  });

  it('never shows the old percentage of a window whose reset time has passed since the snapshot, even when the snapshot calls it fresh', async () => {
    const base = fixtureSnapshot();
    const accounts = base.usage.accounts.map((account) => ({
      ...account,
      limits: account.limits.map((limit) => (limit.kind === 'session' ? { ...limit, freshness: 'fresh' as const, resetsAt: new Date(TEST_NOW - 10 * 60_000).toISOString() } : limit)),
    }));
    const { trigger, open } = await openStatus({ snapshot: { ...base, usage: { ...base.usage, accounts } } });
    const popover = await open();
    const session = within(popover).getByText('Session').closest('div') as HTMLElement;
    expect(session).toHaveTextContent('Window reset');
    expect(session).not.toHaveTextContent('42%');
    expect(trigger).toHaveTextContent('Usage63%');
  });

  it('names who an account is logged in as beside its name', async () => {
    const { open } = await openStatus();
    const popover = await open();
    expect(within(popover).getByText('personal').closest('p')).toHaveTextContent('personal — alex.morgan@example.com · example-org · Max plan');
  });

  it('says that the login is unknown when no usage report named the account', async () => {
    const base = fixtureSnapshot();
    const accounts = base.usage.accounts.map((account) => ({ ...account, identity: null }));
    const { open } = await openStatus({ snapshot: { ...base, usage: { ...base.usage, accounts } } });
    const popover = await open();
    expect(within(popover).getByText('personal').closest('p')).toHaveTextContent('personal — login unknown');
  });

  it('says when the usage of the accounts was never read', async () => {
    const base = fixtureSnapshot();
    const { open } = await openStatus({ snapshot: { ...base, usage: { ...base.usage, accounts: base.usage.accounts.map((account) => ({ ...account, limits: [] })) } } });
    expect(within(await open()).getByText('No usage reading yet.')).toBeInTheDocument();
  });

  it('links to the page of usage and costs', async () => {
    const { open } = await openStatus();
    expect(within(await open()).getByRole('link', { name: 'Open usage and costs' })).toHaveAttribute('href', '/usage');
  });

  it('follows the connection to the factory', async () => {
    const { view, open } = await openStatus();
    const popover = await open();
    expect(within(popover).getByText('Connection: Connecting…')).toBeInTheDocument();
    act(() => view.transport.handlers?.onOpen());
    expect(within(popover).getByText('Connection: Live')).toBeInTheDocument();
  });

  it('keeps the previous memory sample on screen with the error of the failed read', async () => {
    const base = fixtureSnapshot();
    const snapshot = { ...base, resources: { ...base.resources, sample: { ...base.resources.sample, error: 'the sampler stopped answering' } } };
    const { open } = await openStatus({ snapshot });
    const popover = await open();
    expect(within(popover).getByText('Free memory').closest('div')).toHaveTextContent('63%');
    expect(within(popover).getByText(/the sampler stopped answering/)).toBeInTheDocument();
  });

  it('writes the status in French', async () => {
    const { open } = await openStatus({ locale: 'fr' });
    const popover = await open();
    expect(within(popover).getByText('Mémoire libre')).toBeInTheDocument();
    expect(within(popover).getByText('2 sur 3 utilisés')).toBeInTheDocument();
    expect(within(popover).getByText('Hebdomadaire, un modèle · claude-opus-5-5')).toBeInTheDocument();
  });
});
