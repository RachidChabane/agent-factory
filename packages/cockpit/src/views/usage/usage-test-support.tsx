import { screen, within } from '@testing-library/react';
import type { CockpitSnapshot, CostsView, UsageAccountView, UsageLimitView } from '../../contract/index.ts';
import { MINUTE_MS } from '../../i18n/formatters.ts';
import { TEST_NOW } from '../../test/harness.tsx';
import { fixtureSnapshot, renderRoute } from '../../test/render.tsx';
import { present } from '../runs/run-test-support.ts';

export const SNAPSHOT = fixtureSnapshot();

export const minutesAgo = (minutes: number) => new Date(TEST_NOW - minutes * MINUTE_MS).toISOString();

export function withAccounts(update: (account: UsageAccountView) => UsageAccountView, only?: string): CockpitSnapshot {
  return { ...SNAPSHOT, usage: { ...SNAPSHOT.usage, accounts: SNAPSHOT.usage.accounts.map((account) => (only === undefined || account.name === only ? update(account) : account)) } };
}

export function withLimit(kind: UsageLimitView['kind'], scope: string | null, update: (limit: UsageLimitView) => UsageLimitView): CockpitSnapshot {
  return withAccounts((account) => ({ ...account, limits: account.limits.map((limit) => (limit.kind === kind && limit.scope === scope ? update(limit) : limit)) }), 'personal');
}

export function withCosts(costs: Partial<CostsView>): CockpitSnapshot {
  return { ...SNAPSHOT, costs: { ...SNAPSHOT.costs, ...costs } };
}

/** Renders the usage page and waits until it is drawn. */
export async function renderUsage(snapshot: CockpitSnapshot = SNAPSHOT, locale?: 'fr') {
  const view = await renderRoute('/usage', locale === undefined ? { snapshot } : { snapshot, locale });
  await screen.findByRole('heading', { level: 1, name: locale === 'fr' ? 'Usage et coûts' : 'Usage and costs' });
  return view;
}

export const accountCard = (name: string) => within(screen.getByRole('group', { name }));
export const sectionOf = (name: string) => within(present(screen.getByRole('heading', { level: 2, name }).closest('section'), `the section ${name}`));
export const cardOf = (list: HTMLElement) => within(present(list.closest('div'), 'the card of a list'));
