import { within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../../test/render.tsx';
import { expectEveryAmountLabelled, openRun, withRun } from './run-render-support.tsx';
import { CHALLENGER_RUN, FAILED_RUN, FINISHED_RUN, INSTALLATION_RUN, LIVE_RUN, present, REVIEW_RUN, SHARED_ACCOUNT_RUN, STOPPED_RUN, UNKNOWN_ACCOUNT_RUN, WAITING_RUN } from './run-test-support.ts';

const statsOf = (article: HTMLElement) => within(article).getByRole('group', { name: 'Run figures' });
const headerOf = (article: HTMLElement) => present(within(article).getByRole('heading', { level: 1 }).closest('header'), 'the header of the run');

describe('RunDetail header', () => {
  it('names the status, the outcome and the identifier of the run, and copies the identifier', async () => {
    const { view, article } = await openRun(WAITING_RUN);
    expect(within(article).getByText('Waiting for an answer')).toBeInTheDocument();
    expect(within(article).getByText('Decision requested')).toBeInTheDocument();
    expect(within(article).getByText(WAITING_RUN)).toBeInTheDocument();
    await view.user.click(within(article).getByRole('button', { name: 'Copy the identifier' }));
    expect(await navigator.clipboard.readText()).toBe(WAITING_RUN);
  });

  it('says who ran it, with what, which attempt, on which branch, since when, for which project and on which account', async () => {
    const { article } = await openRun(WAITING_RUN);
    const header = within(headerOf(article));
    expect(header.getByRole('heading', { level: 1 })).toHaveTextContent('Implementer · #49 Show the savings of a promo code in the cart summary');
    expect(header.getByText('claude-opus-5-5')).toBeInTheDocument();
    expect(header.getByText('Effort: Very high', { exact: false })).toBeInTheDocument();
    expect(header.getByText('Attempt 4')).toBeInTheDocument();
    expect(header.getByText('factory/49-promo-savings-summary')).toBeInTheDocument();
    expect(header.getByText('Oct 12, 2026, 9:01 AM')).toHaveAttribute('datetime', '2026-10-12T09:01:00.000Z');
    expect(header.getByRole('link', { name: 'Storefront' })).toHaveAttribute('href', '/projects/storefront');
    expect(header.getByTitle('Account')).toHaveTextContent('personal — alex.morgan@example.com · example-org · Max plan');
  });

  it('links the subject of an issue to its page', async () => {
    const { article } = await openRun(WAITING_RUN);
    expect(within(within(article).getByRole('heading', { level: 1 })).getByRole('link', { name: '#49' })).toHaveAttribute('href', '/projects/storefront/issues/49');
  });

  it('links the subject of another kind to its page too', async () => {
    const { article } = await openRun(CHALLENGER_RUN);
    expect(within(within(article).getByRole('heading', { level: 1 })).getByRole('link', { name: 'R-18' })).toHaveAttribute('href', '/projects/storefront/requests/R-18');
  });

  it('shows the subject plainly and says its title is missing when the snapshot no longer holds it', async () => {
    const { article } = await openRun(LIVE_RUN, { snapshot: withRun(LIVE_RUN, (run) => ({ ...run, subject: { kind: 'issue', id: '9999' } })) });
    const title = within(article).getByRole('heading', { level: 1 });
    expect(within(title).queryByRole('link')).not.toBeInTheDocument();
    expect(title).toHaveTextContent('Implementer · #9999 Title not available');
  });

  it('says that a run of the installation has no project, no branch and no account', async () => {
    const { article } = await openRun(INSTALLATION_RUN);
    expect(within(article).getByRole('heading', { level: 1 })).toHaveTextContent('Summarizer · weekly-digest Title not available');
    expect(within(article).getByText('Installation work')).toBeInTheDocument();
    expect(within(article).getByText('No branch')).toBeInTheDocument();
    expect(within(article).queryByTitle('Account')).not.toBeInTheDocument();
  });

  it('shows no account for a run that has none', async () => {
    const { article } = await openRun(UNKNOWN_ACCOUNT_RUN);
    expect(within(article).queryByTitle('Account')).not.toBeInTheDocument();
  });

  it('says the login of an account no usage report named is unknown', async () => {
    const { article } = await openRun(SHARED_ACCOUNT_RUN);
    expect(within(article).getByTitle('Account')).toHaveTextContent('shared — login unknown');
  });

  it.each([
    [FINISHED_RUN, 'Success'],
    [FAILED_RUN, 'Turn limit reached'],
    ['run_91c7d8', 'Budget exceeded'],
    ['run_c04f13', 'Timed out'],
    [STOPPED_RUN, 'Aborted'],
    [CHALLENGER_RUN, 'Error'],
  ])('names the outcome of run %s as %s', async (runId, outcome) => {
    const { article } = await openRun(runId);
    expect(within(article).getByText(outcome)).toBeInTheDocument();
  });

  it('names no outcome for a run that is going', async () => {
    const { article } = await openRun(LIVE_RUN);
    const header = within(headerOf(article));
    expect(header.getByText('Running')).toBeInTheDocument();
    for (const outcome of ['Success', 'Error', 'Aborted', 'Timed out']) expect(header.queryByText(outcome)).not.toBeInTheDocument();
  });

  it('leads back to the list', async () => {
    const { article } = await openRun(LIVE_RUN);
    expect(within(article).getByRole('link', { name: 'All runs' })).toHaveAttribute('href', '/runs');
  });
});

describe('RunDetail figures', () => {
  it('fixes the duration of a run that ended and says when it ended', async () => {
    const { article } = await openRun(FINISHED_RUN);
    const stats = statsOf(article);
    expect(within(stats).getByText('47 min')).toBeInTheDocument();
    expect(within(stats).getByText('4 hr. ago')).toHaveAttribute('datetime', '2026-10-12T05:57:00.000Z');
  });

  it('counts the duration of a run that is going up to now', async () => {
    const { article } = await openRun(LIVE_RUN);
    const stats = statsOf(article);
    expect(within(stats).getByText('14 min')).toBeInTheDocument();
    expect(within(stats).getByText('Running')).toBeInTheDocument();
  });

  it('stops counting when the agent asks a question, and says when it asked', async () => {
    const { article } = await openRun(WAITING_RUN);
    const stats = statsOf(article);
    expect(within(stats).getByText('38 min')).toBeInTheDocument();
    expect(within(stats).getByText('21 min. ago')).toHaveAttribute('datetime', '2026-10-12T09:39:00.000Z');
  });

  it('does not invent a duration for a run that ended without saying when', async () => {
    const { article } = await openRun(STOPPED_RUN, { snapshot: withRun(STOPPED_RUN, (run) => ({ ...run, endedAt: null })) });
    expect(within(statsOf(article)).getByText('End time not recorded')).toBeInTheDocument();
  });

  it('shows the cost with its basis, the budget it is measured against and how much of it is used', async () => {
    const { article } = await openRun(WAITING_RUN);
    const stats = statsOf(article);
    expect(within(stats).getByText('$0.76')).toBeInTheDocument();
    expect(within(stats).getByText('$5.00')).toBeInTheDocument();
    expectEveryAmountLabelled(stats);
    const meter = within(stats).getByRole('meter', { name: 'Budget used' });
    expect(meter).toHaveAttribute('aria-valuenow', '15');
    expect(meter).toHaveAttribute('aria-valuetext', '15%');
  });

  it('labels the figures of a run billed by API key as metered, and none as API-equivalent', async () => {
    const { article } = await openRun(SHARED_ACCOUNT_RUN);
    const stats = statsOf(article);
    expect(within(stats).getAllByText('Metered')).toHaveLength(2);
    expect(within(stats).queryByText('API-equivalent')).not.toBeInTheDocument();
  });

  it('follows the basis of the installation for a run whose account is not recorded', async () => {
    const base = fixtureSnapshot();
    const { article } = await openRun(UNKNOWN_ACCOUNT_RUN, { snapshot: { ...base, costs: { ...base.costs, basis: 'mixed' } } });
    expect(within(statsOf(article)).getAllByText('Mixed')).toHaveLength(2);
  });

  it('says the cost of a live run is known at the end of the run, keeps the budget and draws no meter', async () => {
    const { article } = await openRun(LIVE_RUN, { snapshot: withRun(LIVE_RUN, (run) => ({ ...run, costUsd: 0 })) });
    const stats = statsOf(article);
    expect(within(stats).getByText('Cost known at the end of the run')).toBeInTheDocument();
    expect(within(stats).queryByText('$0.00')).not.toBeInTheDocument();
    expect(within(stats).queryByRole('meter', { name: 'Budget used' })).not.toBeInTheDocument();
    expect(within(stats).getByText('$5.00')).toBeInTheDocument();
  });

  it('shows a cost of zero for a run that ended, as what it cost', async () => {
    const { article } = await openRun(FINISHED_RUN, { snapshot: withRun(FINISHED_RUN, (run) => ({ ...run, costUsd: 0 })) });
    expect(within(statsOf(article)).getByText('$0.00')).toBeInTheDocument();
  });

  it('counts the turns against the limit', async () => {
    const { article } = await openRun(WAITING_RUN);
    const stats = statsOf(article);
    expect(within(stats).getByText('8 of 150')).toBeInTheDocument();
    expect(within(stats).getByRole('meter', { name: 'Turns used' })).toHaveAttribute('aria-valuenow', '5');
  });

  it('states the tokens with and without the cache', async () => {
    const { article } = await openRun(WAITING_RUN);
    const stats = statsOf(article);
    expect(within(stats).getByText('200K tokens including cache')).toBeInTheDocument();
    expect(within(stats).getByText('3K tokens excluding cache')).toBeInTheDocument();
  });

  it('names the tool in use and the subagents', async () => {
    const { article } = await openRun(LIVE_RUN);
    const stats = statsOf(article);
    expect(within(stats).getByText('Read')).toBeInTheDocument();
    expect(within(stats).getByText('2 subagents')).toBeInTheDocument();
  });

  it('says no tool is in use rather than leaving the figure blank', async () => {
    const { article } = await openRun(WAITING_RUN);
    const stats = statsOf(article);
    expect(within(stats).getByText('No tool in use')).toBeInTheDocument();
    expect(within(stats).getByText('No subagent')).toBeInTheDocument();
  });
});

describe('RunDetail tabs', () => {
  it('opens on the log and counts its lines and the subagents', async () => {
    const { article } = await openRun(FINISHED_RUN);
    const log = within(article).getByRole('tab', { name: /^Log/ });
    expect(log).toHaveAttribute('aria-selected', 'true');
    expect(log).toHaveTextContent('57');
    expect(within(article).getByRole('tab', { name: /^Subagents/ })).toHaveTextContent('1');
    expect(within(article).getByRole('tabpanel')).toHaveAccessibleName(/^Log/);
  });

  it('moves between the tabs with the arrow keys', async () => {
    const { view, article } = await openRun(FINISHED_RUN);
    within(article).getByRole('tab', { name: /^Log/ }).focus();
    await view.user.keyboard('{ArrowRight}');
    expect(within(article).getByRole('tab', { name: /^Subagents/ })).toHaveAttribute('aria-selected', 'true');
    await view.user.keyboard('{ArrowRight}');
    expect(within(article).getByRole('tab', { name: 'Gate' })).toHaveAttribute('aria-selected', 'true');
    expect(within(article).getByRole('tabpanel')).toHaveAccessibleName('Gate');
  });
});

describe('RunDetail subagents', () => {
  it('lists the subagents a run started with their tool calls and their last words', async () => {
    const { view, article } = await openRun(FINISHED_RUN);
    await view.user.click(within(article).getByRole('tab', { name: /^Subagents/ }));
    const list = within(article).getByRole('list', { name: 'Subagents of the run' });
    const item = within(list).getByRole('listitem');
    expect(item).toHaveTextContent('Find where a rejected promo code is turned into a message');
    expect(item).toHaveTextContent('Explore');
    expect(item).toHaveTextContent('2 tool calls');
    expect(item).toHaveTextContent('An expired code and a code nobody issued are both reported as unknown');
    expect(within(item).getByRole('img', { name: 'Done' })).toBeInTheDocument();
    expect(within(article).getByText('Main session')).toBeInTheDocument();
  });

  it('shows the subagents that are going as running, with the time they have worked', async () => {
    const { view, article } = await openRun(LIVE_RUN);
    await view.user.click(within(article).getByRole('tab', { name: /^Subagents/ }));
    const items = within(within(article).getByRole('list', { name: 'Subagents of the run' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const item of items) expect(within(item).getByRole('img', { name: 'Running' })).toBeInTheDocument();
    expect(items[0]).toHaveTextContent('Map how the orders endpoint reads its query parameters');
    expect(items[0]).toHaveTextContent('6 min 26 sec');
  });

  it('says that a run started no subagent', async () => {
    const { view, article } = await openRun(REVIEW_RUN);
    await view.user.click(within(article).getByRole('tab', { name: /^Subagents/ }));
    expect(within(article).getByText('No subagent', { selector: 'p' })).toBeInTheDocument();
    expect(within(article).getByText('Subagents started by the agent appear here with their tool calls.')).toBeInTheDocument();
  });
});

describe('RunDetail gate', () => {
  it('lists the passes of the gate, the latest first, with each step and what the steps that did not pass said', async () => {
    const { view, article } = await openRun(FINISHED_RUN);
    await view.user.click(within(article).getByRole('tab', { name: 'Gate' }));
    const passes = within(within(article).getByRole('list', { name: 'Gate passes' })).getAllByRole('list', { name: 'Steps of the pass' });
    expect(passes).toHaveLength(2);
    const [latest, first] = passes.map((steps) => present(steps.closest('li'), 'a pass of the gate'));
    expect(latest).toHaveTextContent('Latest pass');
    expect(latest).toHaveTextContent('Passed');
    expect(first).toHaveTextContent('Pass 1');
    expect(first).toHaveTextContent('Failed');
    expect(first).toHaveTextContent("web/src/cart/PromoField.tsx 3:10 error 'Fragment' is defined but never used");
    expect(within(present(first, 'the first pass')).getAllByText('skipped because an earlier step failed')).toHaveLength(4);
    expect(latest).toHaveTextContent('skill-eval');
    expect(latest).toHaveTextContent('not configured');
  });

  it('says that the gate has not run yet', async () => {
    const { view, article } = await openRun(REVIEW_RUN);
    await view.user.click(within(article).getByRole('tab', { name: 'Gate' }));
    expect(within(article).getByText('The gate has not run yet')).toBeInTheDocument();
    expect(within(article).getByText('The Stop hook runs the deterministic gate before the agent may finish.')).toBeInTheDocument();
  });
});

describe('RunDetail in French', () => {
  it('words the header, the figures and the tabs in French', async () => {
    const { article } = await openRun(WAITING_RUN, { locale: 'fr' });
    expect(within(article).getByText('Attend une réponse')).toBeInTheDocument();
    expect(within(article).getByText('Décision demandée')).toBeInTheDocument();
    expect(within(article).getByText('Effort : Très élevé', { exact: false })).toBeInTheDocument();
    expect(within(article).getByText('Tentative 4')).toBeInTheDocument();
    const stats = within(article).getByRole('group', { name: 'Chiffres du run' });
    expect(within(stats).getByText('8 sur 150')).toBeInTheDocument();
    expect(within(stats).getByText('Aucun outil en cours d’utilisation')).toBeInTheDocument();
    expect(within(stats).getByText('Aucun sous-agent')).toBeInTheDocument();
    expect(within(stats).getByText(/jetons, cache compris/)).toBeInTheDocument();
    expect(within(stats).getByText(/jetons, hors cache/)).toBeInTheDocument();
    expect(within(article).getByRole('tab', { name: /^Sous-agents/ })).toBeInTheDocument();
  });
});
