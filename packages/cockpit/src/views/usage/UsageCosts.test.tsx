import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CostsView } from '../../contract/index.ts';
import { expectEveryAmountLabelled } from '../runs/run-render-support.tsx';
import { present } from '../runs/run-test-support.ts';
import { cardOf, renderUsage, SNAPSHOT, sectionOf, withCosts } from './usage-test-support.tsx';

describe('UsageView costs', () => {
  it.each([
    ['subscription-equivalent', 'Dollar figures are API-equivalent prices'],
    ['metered', 'Dollar figures are metered prices'],
    ['mixed', 'Dollar figures mix metered and API-equivalent prices'],
  ] as const)('explains once, from the basis %s, what the dollar figures mean', async (basis, title) => {
    await renderUsage(withCosts({ basis }));
    expect(screen.getAllByText(title)).toHaveLength(1);
  });

  it('shows the cost of today and of the month with their basis', async () => {
    await renderUsage();
    const costs = within(screen.getByRole('group', { name: 'Cost figures' }));
    expect(costs.getByText('$37.17')).toBeInTheDocument();
    expect(costs.getByText('Oct 12 · 28 runs')).toBeInTheDocument();
    expect(costs.getByText('$86.65')).toBeInTheDocument();
    expectEveryAmountLabelled(screen.getByRole('group', { name: 'Cost figures' }));
  });

  it('counts the runs of today in the singular and at zero', async () => {
    await renderUsage(withCosts({ today: { ...SNAPSHOT.costs.today, runs: 1 } }));
    expect(screen.getByText('Oct 12 · 1 run')).toBeInTheDocument();
  });

  it('says there is no daily cap rather than showing zero', async () => {
    await renderUsage();
    const costs = within(screen.getByRole('group', { name: 'Cost figures' }));
    expect(costs.getByText('No daily cap')).toBeInTheDocument();
    expect(costs.getByText('No daily cost pauses the factory.')).toBeInTheDocument();
    expect(costs.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('shows a daily cap as an amount with how much of it today has used', async () => {
    await renderUsage(withCosts({ dailyCap: { kind: 'usd', amount: 60 } }));
    const costs = within(screen.getByRole('group', { name: 'Cost figures' }));
    expect(costs.getByText('$60.00')).toBeInTheDocument();
    expect(costs.queryByText('No daily cap')).not.toBeInTheDocument();
    const meter = costs.getByRole('meter', { name: 'Cost of today against the daily cap' });
    expect(meter).toHaveAttribute('aria-valuenow', '62');
    expect(costs.getByText('62% of the cap used today')).toBeInTheDocument();
    expect(costs.getByText('The factory pauses when the cost of the day reaches the cap.')).toBeInTheDocument();
  });

  it('says how far past the cap today went', async () => {
    await renderUsage(withCosts({ dailyCap: { kind: 'usd', amount: 30 } }));
    const costs = within(screen.getByRole('group', { name: 'Cost figures' }));
    expect(costs.getByText('124% of the cap used today')).toBeInTheDocument();
    expect(costs.getByRole('meter', { name: 'Cost of today against the daily cap' })).toHaveAttribute('aria-valuenow', '100');
  });

  it('shows the per-run cap with its basis, and says there is none rather than showing zero', async () => {
    await renderUsage();
    const costs = within(screen.getByRole('group', { name: 'Cost figures' }));
    expect(costs.getByText('$5.00')).toBeInTheDocument();
    expect(costs.getByText('No run is given a budget above this amount.')).toBeInTheDocument();
  });

  it('says there is no per-run cap when the installation sets none', async () => {
    await renderUsage(withCosts({ perRunCapUsd: null }));
    const costs = within(screen.getByRole('group', { name: 'Cost figures' }));
    expect(costs.getByText('No per-run cap')).toBeInTheDocument();
    expect(costs.getByText('Each run keeps the budget of its role.')).toBeInTheDocument();
    expect(costs.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('leads to the settings, where the caps are edited', async () => {
    await renderUsage();
    expect(screen.getByRole('link', { name: 'Edit the caps in the settings' })).toHaveAttribute('href', '/settings');
  });

  it('states the tokens of every run with and without the cache', async () => {
    await renderUsage();
    const tokens = sectionOf('Tokens');
    expect(tokens.getByText('Including cache').nextSibling).toHaveTextContent('92,265,541');
    expect(tokens.getByText('Excluding cache').nextSibling).toHaveTextContent('910,741');
    expect(tokens.getByText('Cache read').nextSibling).toHaveTextContent('87,731,400');
    expect(tokens.getByText(/adds the tokens read from and written to the prompt cache/)).toBeInTheDocument();
  });

  it('labels every dollar figure of the page with the basis it has', async () => {
    await renderUsage();
    expectEveryAmountLabelled(document.body);
    expect(screen.queryAllByText('Metered')).toHaveLength(0);
  });

  it('labels them as metered when the costs are billed per token', async () => {
    await renderUsage(withCosts({ basis: 'metered' }));
    expectEveryAmountLabelled(document.body);
    expect(screen.queryAllByText('API-equivalent')).toHaveLength(0);
    expect(screen.queryAllByText('Metered').length).toBeGreaterThan(10);
  });
});

describe('UsageView daily cost', () => {
  it('draws the cost of each day over the period, labelled by its first, middle and last day', async () => {
    await renderUsage();
    const daily = sectionOf('Cost per day');
    expect(daily.getByRole('img', { name: 'Cost per day over the last 14 days' })).toBeInTheDocument();
    expect(daily.getByText('The last 14 days')).toBeInTheDocument();
    for (const day of ['Sep 29', 'Oct 5', 'Oct 12']) expect(daily.getByText(day)).toBeInTheDocument();
  });

  it('sums the period with its basis', async () => {
    await renderUsage();
    const daily = sectionOf('Cost per day');
    expect(daily.getByText('Total over the period').nextSibling).toHaveTextContent('$89.00API-equivalent');
    expect(daily.getByText('Average per day').nextSibling).toHaveTextContent('$6.36API-equivalent');
    expect(daily.getByText('Runs over the period').nextSibling).toHaveTextContent('68');
  });

  it('says the chart draws no limit line when there is no daily cap', async () => {
    await renderUsage();
    const daily = sectionOf('Cost per day');
    expect(daily.getByText('No daily cap: the chart draws no limit line.')).toBeInTheDocument();
    expect(daily.queryByText(/^Daily cap/)).not.toBeInTheDocument();
  });

  it('draws the daily cap across the chart, with its basis, when it is a number', async () => {
    await renderUsage(withCosts({ dailyCap: { kind: 'usd', amount: 60 } }));
    const daily = sectionOf('Cost per day');
    expect(daily.getByText('Daily cap $60.00 · API-equivalent')).toBeInTheDocument();
    expect(daily.queryByText(/chart draws no limit line/)).not.toBeInTheDocument();
  });

  it('names the cost of a day, with its basis, to a keyboard user who walks along the bars', async () => {
    const view = await renderUsage();
    const chart = sectionOf('Cost per day').getByRole('img', { name: 'Cost per day over the last 14 days' });
    chart.focus();
    await view.user.keyboard('{ArrowLeft}');
    const tip = cardOf(chart);
    expect(tip.getAllByText('Oct 12')).toHaveLength(2);
    expect(tip.getByText('$37.17 · API-equivalent')).toBeInTheDocument();
    await view.user.keyboard('{ArrowLeft}');
    expect(tip.getByText('Oct 11')).toBeInTheDocument();
  });

  it('names the metered basis in the same place when the costs are metered', async () => {
    const view = await renderUsage(withCosts({ basis: 'metered' }));
    const chart = sectionOf('Cost per day').getByRole('img', { name: 'Cost per day over the last 14 days' });
    chart.focus();
    await view.user.keyboard('{ArrowLeft}');
    expect(cardOf(chart).getByText('$37.17 · Metered')).toBeInTheDocument();
  });

  it('says so when the period holds no day', async () => {
    await renderUsage(withCosts({ daily: [] }));
    expect(sectionOf('Cost per day').getByText('No cost recorded over this period')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Cost per day over/ })).not.toBeInTheDocument();
  });

  it('describes a one-day period in the singular', async () => {
    await renderUsage(withCosts({ daily: SNAPSHOT.costs.daily.slice(-1) }));
    expect(sectionOf('Cost per day').getByText('The last day')).toBeInTheDocument();
    expect(sectionOf('Cost per day').getByRole('img', { name: 'Cost of the last day' })).toBeInTheDocument();
  });
});

describe('UsageView breakdown', () => {
  const listOf = (title: string) => within(screen.getByRole('list', { name: title }));

  it('splits the cost by project, with links, runs and tokens with and without the cache', async () => {
    await renderUsage();
    const [storefront, ledger] = listOf('By project').getAllByRole('listitem').map((item) => present(item, 'a project'));
    expect(within(present(storefront, 'storefront')).getByRole('link', { name: 'Storefront' })).toHaveAttribute('href', '/projects/storefront');
    expect(storefront).toHaveTextContent('$72.97API-equivalent');
    expect(storefront).toHaveTextContent('54 runs');
    expect(storefront).toHaveTextContent('75M tokens including cache');
    expect(storefront).toHaveTextContent('701.3K tokens excluding cache');
    expect(within(present(ledger, 'ledger')).getByRole('link', { name: 'Ledger' })).toHaveAttribute('href', '/projects/ledger');
  });

  it('splits the cost by role, naming each role', async () => {
    await renderUsage();
    const roles = listOf('By role').getAllByRole('listitem');
    expect(roles).toHaveLength(7);
    expect(roles[0]).toHaveTextContent('Implementer');
    expect(roles[0]).toHaveTextContent('$38.83');
    expect(roles[0]).toHaveTextContent('28 runs');
    expect(roles.at(-1)).toHaveTextContent('Summarizer');
    expect(roles.at(-1)).toHaveTextContent('1 run');
    expect(roles.at(-1)).not.toHaveTextContent('1 runs');
  });

  it('shows a group whose key is not a role as it came', async () => {
    const byRole = [...SNAPSHOT.costs.byRole, { key: 'planner', costUsd: 0.5, runs: 2, tokens: SNAPSHOT.costs.tokens }];
    await renderUsage(withCosts({ byRole }));
    expect(within(screen.getByRole('list', { name: 'By role' })).getByText('planner')).toBeInTheDocument();
  });

  it('splits the cost by model', async () => {
    await renderUsage();
    const models = listOf('By model').getAllByRole('listitem');
    expect(models).toHaveLength(3);
    expect(models[0]).toHaveTextContent(/^claude-opus-5-5\$56\.47/);
    expect(models[1]).toHaveTextContent(/^claude-sonnet-5-5/);
    expect(models[2]).toHaveTextContent(/^claude-haiku-5-5/);
  });

  it('orders a group from the dearest to the cheapest, whatever order it came in', async () => {
    const byModel = SNAPSHOT.costs.byModel.toReversed();
    await renderUsage(withCosts({ byModel }));
    expect(listOf('By model').getAllByRole('listitem')[0]).toHaveTextContent('claude-opus-5-5');
  });

  it('splits the cost by issue, each with its title, its project and a link to the issue of that project', async () => {
    await renderUsage();
    const first = present(listOf('By issue').getAllByRole('listitem')[0], 'the dearest issue');
    expect(first).toHaveTextContent('#49');
    expect(first).toHaveTextContent('Show the savings of a promo code in the cart summary');
    expect(first).toHaveTextContent('Storefront');
    expect(first).toHaveTextContent('$16.68API-equivalent');
    expect(within(first).getByRole('link', { name: 'Open issue #49 of Storefront' })).toHaveAttribute('href', '/projects/storefront/issues/49');
  });

  it('lists the first issues and the others on request, and tells the issues of two projects apart', async () => {
    const view = await renderUsage();
    expect(listOf('By issue').getAllByRole('listitem')).toHaveLength(8);
    const card = cardOf(screen.getByRole('list', { name: 'By issue' }));
    await view.user.click(card.getByRole('button', { name: 'Show more' }));
    expect(listOf('By issue').getAllByRole('listitem')).toHaveLength(SNAPSHOT.costs.byIssue.length);
    const nineteen = listOf('By issue').getAllByRole('link', { name: /Open issue #19 of/ });
    expect(nineteen.map((link) => link.getAttribute('href')).sort()).toEqual(['/projects/ledger/issues/19', '/projects/storefront/issues/19']);
    await view.user.click(card.getByRole('button', { name: 'Show less' }));
    expect(listOf('By issue').getAllByRole('listitem')).toHaveLength(8);
  });

  it('offers no more to show for a group that fits', async () => {
    await renderUsage();
    expect(cardOf(screen.getByRole('list', { name: 'By role' })).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an issue the project no longer holds by its number alone', async () => {
    const entry: CostsView['byIssue'][number] = { ...present(SNAPSHOT.costs.byIssue[0], 'an issue entry'), key: 'storefront/9999', issueNumber: 9999 };
    await renderUsage(withCosts({ byIssue: [entry] }));
    const item = present(listOf('By issue').getAllByRole('listitem')[0], 'the issue');
    expect(item).toHaveTextContent('#9999');
    expect(within(item).queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows a project the installation no longer drives by its key alone', async () => {
    const byProject: CostsView['byProject'] = [{ ...present(SNAPSHOT.costs.byProject[0], 'a project entry'), key: 'retired' }];
    await renderUsage(withCosts({ byProject }));
    const item = present(listOf('By project').getAllByRole('listitem')[0], 'the project');
    expect(item).toHaveTextContent('retired');
    expect(within(item).queryByRole('link')).not.toBeInTheDocument();
  });

  it('says a group holds nothing yet', async () => {
    await renderUsage(withCosts({ byModel: [] }));
    expect(screen.queryByRole('list', { name: 'By model' })).not.toBeInTheDocument();
    expect(present(screen.getByRole('heading', { level: 3, name: 'By model' }).closest('div'), 'the card')).toHaveTextContent('Nothing recorded yet');
  });
});

describe('UsageView costs in French', () => {
  it('words the costs in French, with the basis of every amount', async () => {
    await renderUsage(SNAPSHOT, 'fr');
    const costs = within(screen.getByRole('group', { name: 'Chiffres de coût' }));
    expect(costs.getByText('Aucun plafond quotidien')).toBeInTheDocument();
    expect(costs.getByText('12 oct. · 28 runs')).toBeInTheDocument();
    expect(costs.getAllByText('Équivalent API').length).toBeGreaterThan(2);
    expect(screen.getByText('Les montants en dollars sont des prix API équivalents')).toBeInTheDocument();
  });

  it('counts a day with no run in the French singular and the same day in English in the plural', async () => {
    const snapshot = withCosts({ today: { ...SNAPSHOT.costs.today, runs: 0 } });
    await renderUsage(snapshot, 'fr');
    expect(screen.getByText('12 oct. · 0 run')).toBeInTheDocument();
  });

  it('counts a day with no run in the English plural', async () => {
    await renderUsage(withCosts({ today: { ...SNAPSHOT.costs.today, runs: 0 } }));
    expect(screen.getByText('Oct 12 · 0 runs')).toBeInTheDocument();
  });

  it('words the breakdown in French with the tokens stated both ways', async () => {
    await renderUsage(SNAPSHOT, 'fr');
    const first = present(within(screen.getByRole('list', { name: 'Par projet' })).getAllByRole('listitem')[0], 'a project');
    expect(first).toHaveTextContent(/jetons, cache compris/);
    expect(first).toHaveTextContent(/jetons, hors cache/);
    expect(screen.getByRole('button', { name: 'Afficher plus' })).toBeInTheDocument();
  });
});
