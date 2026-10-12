import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { isLiveRun } from '../../model/projects.ts';
import { mapRuns } from '../../test/fixtures/mutate.ts';
import { fixtureSnapshot } from '../../test/render.tsx';
import { FINISHED_PAGE_SIZE } from './run-list-model.ts';
import { expectEveryAmountLabelled, linkToRun, renderRuns, withRun, withRuns } from './run-render-support.tsx';
import { FAILED_RUN, INSTALLATION_RUN, LIVE_RUN, present, SHARED_ACCOUNT_RUN, STOPPED_RUN, UNKNOWN_ACCOUNT_RUN, WAITING_RUN } from './run-test-support.ts';

const SNAPSHOT = fixtureSnapshot();
const ALL_RUNS = SNAPSHOT.runs.length;
const FINISHED_IDS = SNAPSHOT.runs.filter((run) => !isLiveRun(run)).map((run) => run.id);
const LEDGER_IDS = SNAPSHOT.runs.filter((run) => run.project === 'ledger').map((run) => run.id);

const listOf = () => screen.getByRole('region', { name: 'Run list' });
const hrefsOf = (container: HTMLElement) => within(container).getAllByRole('link').map((link) => link.getAttribute('href'));
const hrefsOfRuns = (ids: readonly string[], suffix = '') => ids.map((id) => `/runs/${id}${suffix}`);
const resultOf = () => within(listOf()).getByRole('status');
const searchBox = () => within(listOf()).getByRole('searchbox', { name: 'Filter the runs' });
const projectSelect = () => within(listOf()).getByRole('combobox', { name: 'Project' });

describe('RunsView list', () => {
  it('lists the live runs first and the finished ones after them, the most recently started first', async () => {
    await renderRuns();
    expect(hrefsOf(within(listOf()).getByRole('region', { name: 'Live' }))).toEqual(hrefsOfRuns([LIVE_RUN, WAITING_RUN]));
    expect(hrefsOf(within(listOf()).getByRole('region', { name: 'Finished' }))).toEqual(hrefsOfRuns(FINISHED_IDS.slice(0, FINISHED_PAGE_SIZE)));
  });

  it('counts the runs of each group and all of them in the title', async () => {
    await renderRuns();
    expect(within(listOf()).getByText('Live · 2')).toBeInTheDocument();
    expect(within(listOf()).getByText(`Finished · ${FINISHED_IDS.length}`)).toBeInTheDocument();
    expect(within(listOf()).getByRole('heading', { level: 1 })).toHaveTextContent(`Runs${ALL_RUNS}`);
  });

  it('shows what each run is: its role, its subject, its model, its project, when it started and what it cost', async () => {
    await renderRuns();
    const link = linkToRun(listOf(), LIVE_RUN);
    expect(link).toHaveTextContent('Implementer · #45 Filter the order history by status');
    expect(link).toHaveTextContent('claude-sonnet-5-5');
    expect(link).toHaveTextContent('Storefront');
    expect(within(link).getByText('14 min. ago')).toHaveAttribute('datetime', '2026-10-12T09:46:00.000Z');
    expect(within(link).getByText('$0.12')).toBeInTheDocument();
    expect(link).toHaveTextContent('personal — alex.morgan@example.com · example-org · Max plan');
  });

  it('draws the agent glyph for a running run and a mark that names the status for the others', async () => {
    await renderRuns();
    expect(within(linkToRun(listOf(), LIVE_RUN)).getByRole('img', { name: 'Agent working' })).toBeInTheDocument();
    expect(within(linkToRun(listOf(), WAITING_RUN)).getByRole('img', { name: 'Waiting for an answer' })).toBeInTheDocument();
  });

  it('says in the list that a run waits for an answer', async () => {
    await renderRuns();
    expect(linkToRun(listOf(), WAITING_RUN)).toHaveTextContent('Waiting for an answer');
    expect(linkToRun(listOf(), LIVE_RUN)).not.toHaveTextContent('Waiting for an answer');
  });

  it.each([
    [FAILED_RUN, 'Failed'],
    [STOPPED_RUN, 'Stopped'],
  ])('marks the finished run %s as %s', async (runId, status) => {
    await renderRuns(`/runs/${runId}`);
    expect(within(linkToRun(listOf(), runId)).getByRole('img', { name: status })).toBeInTheDocument();
  });

  it('shows a run of the installation without a project as installation work, and names no account for it', async () => {
    await renderRuns(`/runs/${INSTALLATION_RUN}`);
    const link = linkToRun(listOf(), INSTALLATION_RUN);
    expect(link).toHaveTextContent('Summarizer · weekly-digest');
    expect(link).toHaveTextContent('Installation work');
    expect(link).not.toHaveTextContent('login unknown');
    expect(link).not.toHaveTextContent('personal');
  });

  it('names the subject by its reference alone when the snapshot no longer holds its title', async () => {
    const snapshot = withRun(LIVE_RUN, (run) => ({ ...run, subject: { kind: 'issue', id: '9999' } }));
    await renderRuns('/runs', { snapshot });
    expect(linkToRun(listOf(), LIVE_RUN)).toHaveTextContent(/Implementer · #9999(?!\s)/);
  });

  it('shows the first finished runs and offers the others', async () => {
    const view = await renderRuns();
    const finished = within(listOf()).getByRole('region', { name: 'Finished' });
    expect(within(finished).getAllByRole('link')).toHaveLength(FINISHED_PAGE_SIZE);
    const rest = FINISHED_IDS.length - FINISHED_PAGE_SIZE;
    await view.user.click(within(finished).getByRole('button', { name: `Show ${rest} more runs` }));
    expect(within(finished).getAllByRole('link')).toHaveLength(FINISHED_IDS.length);
    expect(within(finished).queryByRole('button', { name: /more run/ })).not.toBeInTheDocument();
  });

  it('counts what is left in the singular too', async () => {
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => runs.slice(0, 2 + FINISHED_PAGE_SIZE + 1));
    await renderRuns('/runs', { snapshot });
    expect(within(listOf()).getByRole('button', { name: 'Show 1 more run' })).toBeInTheDocument();
  });

  it('lists the run being looked at even when it lies beyond the first page', async () => {
    const beyond = present(FINISHED_IDS[FINISHED_PAGE_SIZE + 9], 'a finished run past the first page');
    await renderRuns(`/runs/${beyond}`);
    const finished = within(listOf()).getByRole('region', { name: 'Finished' });
    expect(within(finished).getAllByRole('link')).toHaveLength(FINISHED_PAGE_SIZE + 10);
    expect(linkToRun(listOf(), beyond)).toHaveAttribute('aria-current', 'page');
  });
});

describe('RunsView filters', () => {
  it('narrows the list to the project named in the address', async () => {
    await renderRuns('/runs?project=ledger');
    expect(hrefsOf(listOf())).toEqual(hrefsOfRuns(LEDGER_IDS, '?project=ledger'));
    expect(projectSelect()).toHaveValue('ledger');
    expect(resultOf()).toHaveTextContent(`${LEDGER_IDS.length} of ${ALL_RUNS} runs`);
  });

  it('names the project of a run only while the list is not narrowed to one', async () => {
    await renderRuns('/runs?project=ledger');
    for (const link of within(listOf()).getAllByRole('link')) expect(link).not.toHaveTextContent('Ledger');
  });

  it('shows the project of each run in the full list', async () => {
    await renderRuns();
    expect(linkToRun(listOf(), present(LEDGER_IDS[0], 'a ledger run'))).toHaveTextContent('Ledger');
  });

  it('filters nothing for a project the installation does not know', async () => {
    await renderRuns('/runs?project=gone');
    expect(resultOf()).toHaveTextContent(`${ALL_RUNS} of ${ALL_RUNS} runs`);
    expect(projectSelect()).toHaveValue('');
  });

  it('writes the project to the address when it is chosen, and takes it away when all projects are chosen again', async () => {
    const view = await renderRuns();
    await view.user.selectOptions(projectSelect(), 'Ledger');
    await view.expectLocation('/runs?project=ledger');
    await view.user.selectOptions(projectSelect(), 'All projects');
    await view.expectLocation('/runs');
  });

  it('keeps the project when a run is opened, and when the way back is followed', async () => {
    const view = await renderRuns('/runs?project=ledger');
    const first = present(LEDGER_IDS[0], 'a ledger run');
    await view.user.click(linkToRun(listOf(), first));
    await view.expectLocation(`/runs/${first}?project=ledger`);
    expect(await screen.findByRole('link', { name: 'All runs' })).toHaveAttribute('href', '/runs?project=ledger');
  });

  it('offers no project choice when the installation drives a single project', async () => {
    const snapshot = { ...fixtureSnapshot(), projects: fixtureSnapshot().projects.slice(0, 1) };
    await renderRuns('/runs', { snapshot });
    expect(within(listOf()).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it.each([
    ['reviewer', (run: { role: string; model: string }) => run.role === 'reviewer'],
    ['OPUS', (run: { role: string; model: string }) => run.model.includes('opus')],
    ['reviewer haiku', () => false],
    ['acceptance-author', (run: { role: string; model: string }) => run.role === 'acceptance-author'],
    ['checks author', (run: { role: string; model: string }) => run.role === 'acceptance-author'],
  ])('filters the runs on the words %j of their role or model', async (words, matches) => {
    const view = await renderRuns();
    await view.user.type(searchBox(), words);
    const expected = SNAPSHOT.runs.filter(matches).map((run) => run.id);
    expect(resultOf()).toHaveTextContent(`${expected.length} of ${ALL_RUNS} runs`);
    if (expected.length > 0) expect(hrefsOf(listOf()).sort()).toEqual(hrefsOfRuns(expected).sort());
  });

  it('filters the runs on their subject: its reference or its title', async () => {
    const view = await renderRuns();
    const ofIssue45 = SNAPSHOT.runs.filter((run) => run.project === 'storefront' && run.subject.kind === 'issue' && run.subject.id === '45').map((run) => run.id);
    await view.user.type(searchBox(), '#45');
    expect(hrefsOf(listOf()).sort()).toEqual(hrefsOfRuns(ofIssue45).sort());
    await view.user.clear(searchBox());
    await view.user.type(searchBox(), 'filter the order history');
    expect(hrefsOf(listOf()).sort()).toEqual(hrefsOfRuns(ofIssue45).sort());
  });

  it('finds a run by its identifier', async () => {
    const view = await renderRuns();
    await view.user.type(searchBox(), INSTALLATION_RUN);
    expect(hrefsOf(listOf())).toEqual(hrefsOfRuns([INSTALLATION_RUN]));
  });

  it('says when no run matches, and clears the project and the words together', async () => {
    const view = await renderRuns('/runs?project=ledger');
    await view.user.type(searchBox(), 'nothing of the kind');
    expect(within(listOf()).getByText('No run matches these filters')).toBeInTheDocument();
    expect(resultOf()).toHaveTextContent(`0 of ${ALL_RUNS} runs`);
    await view.user.click(within(listOf()).getByRole('button', { name: 'Clear the filters' }));
    await view.expectLocation('/runs');
    expect(searchBox()).toHaveValue('');
    expect(resultOf()).toHaveTextContent(`${ALL_RUNS} of ${ALL_RUNS} runs`);
    expect(within(listOf()).queryByRole('button', { name: 'Clear the filters' })).not.toBeInTheDocument();
  });

  it('keeps the words typed when a run is opened', async () => {
    const view = await renderRuns();
    await view.user.type(searchBox(), 'reviewer');
    const [first] = within(listOf()).getAllByRole('link');
    await view.user.click(present(first, 'a listed run'));
    await screen.findByRole('link', { name: 'All runs' });
    expect(searchBox()).toHaveValue('reviewer');
  });
});

describe('RunsView money', () => {
  it('explains once what the dollar figures mean, from the bases of the runs it lists', async () => {
    await renderRuns();
    expect(screen.getAllByText('Dollar figures mix metered and API-equivalent prices')).toHaveLength(1);
  });

  it('explains the single basis the listed runs share', async () => {
    await renderRuns('/runs', { snapshot: withRuns((run) => ({ ...run, account: 'personal' })) });
    expect(screen.getAllByText('Dollar figures are API-equivalent prices')).toHaveLength(1);
  });

  it('explains metered prices when every listed run was billed per token', async () => {
    await renderRuns('/runs', { snapshot: withRuns((run) => ({ ...run, account: 'shared' })) });
    expect(screen.getAllByText('Dollar figures are metered prices')).toHaveLength(1);
  });

  it('explains nothing when no run is listed', async () => {
    await renderRuns('/runs', { snapshot: mapRuns(fixtureSnapshot(), () => []) });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('labels every dollar figure of the list with what it means', async () => {
    await renderRuns();
    expectEveryAmountLabelled(listOf());
  });

  it('labels the cost of a run with the basis of the account that ran it', async () => {
    await renderRuns(`/runs/${SHARED_ACCOUNT_RUN}`);
    expect(linkToRun(listOf(), SHARED_ACCOUNT_RUN)).toHaveTextContent('Metered');
    expect(linkToRun(listOf(), SHARED_ACCOUNT_RUN)).not.toHaveTextContent('API-equivalent');
    expect(linkToRun(listOf(), LIVE_RUN)).toHaveTextContent('API-equivalent');
  });

  it('follows the basis of the installation for a run whose account is not recorded', async () => {
    const base = fixtureSnapshot();
    await renderRuns(`/runs/${UNKNOWN_ACCOUNT_RUN}`, { snapshot: { ...base, costs: { ...base.costs, basis: 'metered' } } });
    expect(linkToRun(listOf(), UNKNOWN_ACCOUNT_RUN)).toHaveTextContent('Metered');
  });

  it('says that the cost of a live run is known at the end instead of showing zero', async () => {
    await renderRuns('/runs', { snapshot: withRun(LIVE_RUN, (run) => ({ ...run, costUsd: 0 })) });
    const link = linkToRun(listOf(), LIVE_RUN);
    expect(link).toHaveTextContent('Cost known at the end of the run');
    expect(link).not.toHaveTextContent('$0.00');
  });
});

describe('RunsView selection', () => {
  it('opens the first live run when no run is named', async () => {
    await renderRuns();
    expect(await screen.findByRole('heading', { level: 1, name: 'Implementer · #45 Filter the order history by status' })).toBeInTheDocument();
    expect(linkToRun(listOf(), LIVE_RUN)).toHaveAttribute('aria-current', 'page');
  });

  it('opens the run named in the address and marks it in the list', async () => {
    await renderRuns(`/runs/${WAITING_RUN}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Implementer · #49 Show the savings of a promo code in the cart summary' })).toBeInTheDocument();
    expect(linkToRun(listOf(), WAITING_RUN)).toHaveAttribute('aria-current', 'page');
    expect(linkToRun(listOf(), LIVE_RUN)).not.toHaveAttribute('aria-current');
  });

  it('opens a run when it is chosen in the list', async () => {
    const view = await renderRuns();
    await view.user.click(linkToRun(listOf(), WAITING_RUN));
    await view.expectLocation(`/runs/${WAITING_RUN}`);
    expect(await screen.findByText('run_5d0911')).toBeInTheDocument();
  });

  it('invites to pick a run when none is live', async () => {
    const snapshot = withRuns((run) => (isLiveRun(run) ? { ...run, status: 'succeeded', outcome: 'success', pendingQuestion: null } : run));
    await renderRuns('/runs', { snapshot });
    expect(await screen.findByRole('heading', { level: 2, name: 'Pick a run' })).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('opens no live run of a project that has none', async () => {
    await renderRuns('/runs?project=ledger');
    expect(await screen.findByRole('heading', { level: 2, name: 'Pick a run' })).toBeInTheDocument();
  });

  it('says so when the run does not exist', async () => {
    await renderRuns('/runs/run_missing');
    expect(await screen.findByRole('heading', { level: 2, name: 'Run not found' })).toBeInTheDocument();
    expect(screen.getByText('The installation holds no run with this identifier.')).toBeInTheDocument();
  });

  it('says so when the installation has no run at all', async () => {
    await renderRuns('/runs', { snapshot: mapRuns(fixtureSnapshot(), () => []) });
    expect(screen.getAllByText('No run yet')).toHaveLength(2);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});

describe('RunsView in French', () => {
  it('words the list, the filters and the groups in French', async () => {
    await renderRuns('/runs', { locale: 'fr' });
    const list = screen.getByRole('region', { name: 'Liste des runs' });
    expect(within(list).getByRole('region', { name: 'En direct' })).toBeInTheDocument();
    expect(within(list).getByRole('region', { name: 'Terminés' })).toBeInTheDocument();
    expect(within(list).getByRole('status')).toHaveTextContent(`${ALL_RUNS} sur ${ALL_RUNS} runs`);
    expect(within(list).getByRole('searchbox', { name: 'Filtrer les runs' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: `Afficher ${FINISHED_IDS.length - FINISHED_PAGE_SIZE} runs de plus` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arrêter' })).toBeInTheDocument();
  });

  it('counts what is left in the French singular', async () => {
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => runs.slice(0, 2 + FINISHED_PAGE_SIZE + 1));
    await renderRuns('/runs', { snapshot, locale: 'fr' });
    expect(screen.getByRole('button', { name: 'Afficher 1 run de plus' })).toBeInTheDocument();
  });

  it('says in French that the cost of a live run is not known yet', async () => {
    await renderRuns('/runs', { snapshot: withRun(LIVE_RUN, (run) => ({ ...run, costUsd: 0 })), locale: 'fr' });
    expect(linkToRun(screen.getByRole('region', { name: 'Liste des runs' }), LIVE_RUN)).toHaveTextContent('Coût connu à la fin du run');
  });
});
