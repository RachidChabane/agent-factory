import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { ISSUE, PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { ISSUE as LEDGER_ISSUE } from '../../test/fixtures/ledger/ids.ts';
import { fixtureSnapshot, renderRoute } from '../../test/render.tsx';
import { issuesPath, LEDGER, openIssue, STOREFRONT, withIssue } from './issue-test-support.ts';

const STOREFRONT_NUMBERS = ['79', '77', '75', '73', '70', '66', '64', '61', '58', '55', '52', '49', '45', '41', '36', '31', '28', '24', '19', '12'];

async function openTable(path = issuesPath(STOREFRONT), options: Parameters<typeof renderRoute>[1] = {}) {
  const view = await renderRoute(path, options);
  const table = await screen.findByRole('table', { name: options.locale === 'fr' ? 'Issues du projet' : 'Issues of the project' });
  return { view, table };
}

const dataRows = (table: HTMLElement): HTMLElement[] => within(table).getAllByRole('row').slice(1);
const numbersOf = (table: HTMLElement): (string | undefined)[] => dataRows(table).map((row) => /#(\d+)/.exec(row.textContent ?? '')?.[1]);
const rowOf = (table: HTMLElement, title: string | RegExp): HTMLElement => within(table).getByRole('row', { name: title });

describe('IssuesView table', () => {
  it('lists the issues of the project, the most recent number first', async () => {
    const { table } = await openTable();
    expect(numbersOf(table)).toEqual(STOREFRONT_NUMBERS);
    expect(screen.getByRole('heading', { level: 1, name: /Issues/ })).toHaveTextContent(/Issues\s*20 in total/);
  });

  it('names its columns', async () => {
    const { table } = await openTable();
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Number', 'Title', 'Type', 'State', 'Pull request', 'Updated', 'Cost']);
  });

  it('shows for each issue its type, its state, its pull request and when it changed', async () => {
    const { table } = await openTable();
    const ready = rowOf(table, /Understand colour and price words/);
    expect(ready).toHaveTextContent('Prompt');
    expect(ready).toHaveTextContent('Ready to merge');
    expect(ready).toHaveTextContent('PR #57');
    expect(ready).toHaveTextContent('2 days ago');
    expect(within(ready).getByRole('link', { name: 'PR #57' })).toHaveAttribute('href', `/projects/${STOREFRONT}/pull-requests/${PULL_REQUEST.naturalLanguageSearch}`);
  });

  it('says that an issue has no pull request yet rather than leaving the cell blank', async () => {
    const { table } = await openTable();
    expect(rowOf(table, /Show the savings of a promo code/)).toHaveTextContent('No pull request yet');
    expect(within(rowOf(table, /Show the savings of a promo code/)).queryByRole('link')).not.toBeInTheDocument();
  });

  it('writes the cost of every issue with what the figure means', async () => {
    const { table } = await openTable();
    expect(rowOf(table, /Understand colour and price words/)).toHaveTextContent('$8.32API-equivalent');
    expect(within(table).getAllByText('API-equivalent')).toHaveLength(20);
    expect(within(table).queryByText('Metered')).not.toBeInTheDocument();
  });

  it('names the metered price when the installation is billed per token', async () => {
    const base = fixtureSnapshot();
    const { table } = await openTable(issuesPath(STOREFRONT), { snapshot: { ...base, costs: { ...base.costs, basis: 'metered' } } });
    expect(within(table).getAllByText('Metered')).toHaveLength(20);
    expect(within(table).queryByText('API-equivalent')).not.toBeInTheDocument();
  });

  it('explains the dollar figures once for the whole table', async () => {
    await openTable();
    const notes = screen.getAllByRole('note');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent('Dollar figures are API-equivalent prices');
  });

  it('marks the issues that are paused', async () => {
    const { table } = await openTable(issuesPath(LEDGER));
    expect(rowOf(table, /Export invoices as CSV/)).toHaveTextContent('Paused');
    expect(rowOf(table, /Support credit notes/)).not.toHaveTextContent('Paused');
  });

  it('lists only the issues of the project of the address', async () => {
    const { table } = await openTable(issuesPath(LEDGER));
    expect(numbersOf(table)).toEqual(['30', '29', '27', '26', '23', '19', '16', '12', '8']);
    expect(within(table).queryByText('Show the savings of a promo code in the cart summary')).not.toBeInTheDocument();
    expect(rowOf(table, /#12 /)).toHaveTextContent('Accept an idempotency key on payment creation');
  });

  it('links the pull request of a local forge to the pull request page of the project', async () => {
    const { table } = await openTable(issuesPath(LEDGER));
    expect(within(rowOf(table, /Verify webhook signatures/)).getByRole('link', { name: 'PR #22' })).toHaveAttribute('href', `/projects/${LEDGER}/pull-requests/22`);
  });
});

describe('IssuesView opening an issue', () => {
  it('opens the issue of a row that is clicked', async () => {
    const { view, table } = await openTable();
    await view.user.click(rowOf(table, /Show the savings of a promo code/));
    await view.expectLocation(`/projects/${STOREFRONT}/issues/${ISSUE.promoSavingsSummary}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Show the savings of a promo code in the cart summary' })).toBeInTheDocument();
  });

  it('moves from row to row with the arrow keys and opens the focused one with Enter', async () => {
    const { view, table } = await openTable();
    const rows = dataRows(table);
    (rows[0] as HTMLElement).focus();
    await view.user.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveFocus();
    await view.user.keyboard('{ArrowDown}{ArrowUp}{End}');
    expect(rows[rows.length - 1]).toHaveFocus();
    await view.user.keyboard('{Home}{ArrowDown}');
    await view.user.keyboard('{Enter}');
    await view.expectLocation(`/projects/${STOREFRONT}/issues/${ISSUE.stockLevelOnProduct}`);
  });

  it('opens the pull request, not the issue, when its link is clicked', async () => {
    const { view, table } = await openTable();
    await view.user.click(within(rowOf(table, /Understand colour and price words/)).getByRole('link', { name: 'PR #57' }));
    await view.expectLocation(`/projects/${STOREFRONT}/pull-requests/${PULL_REQUEST.naturalLanguageSearch}`);
  });

  it('opens the pull request, not the issue, when its link is activated with the keyboard', async () => {
    const { view, table } = await openTable();
    within(rowOf(table, /Understand colour and price words/)).getByRole('link', { name: 'PR #57' }).focus();
    await view.user.keyboard('{Enter}');
    await view.expectLocation(`/projects/${STOREFRONT}/pull-requests/${PULL_REQUEST.naturalLanguageSearch}`);
  });
});

describe('IssuesView filters', () => {
  it('counts the issues of each group', async () => {
    await openTable();
    const groups = screen.getByRole('radiogroup', { name: 'Filter the issues by progress' });
    expect(within(groups).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['All20', 'Needs you3', 'In progress6', 'Queued3', 'Delivered7', 'Abandoned1']);
    expect(within(groups).getByRole('radio', { name: /All/ })).toBeChecked();
  });

  it.each([
    ['Needs you', ['75', '52', '49']],
    ['In progress', ['66', '64', '61', '58', '55', '45']],
    ['Queued', ['77', '73', '70']],
    ['Delivered', ['41', '36', '31', '28', '24', '19', '12']],
    ['Abandoned', ['79']],
  ])('narrows the table to the issues that are %s', async (group, numbers) => {
    const { view, table } = await openTable();
    await view.user.click(within(screen.getByRole('radiogroup', { name: 'Filter the issues by progress' })).getByRole('radio', { name: new RegExp(group) }));
    expect(numbersOf(table)).toEqual(numbers);
    expect(screen.getByText(`${numbers.length} of 20 issues`)).toBeInTheDocument();
  });

  it('narrows the table to the issues whose title holds the text, whatever the case', async () => {
    const { view, table } = await openTable();
    await view.user.type(screen.getByRole('searchbox', { name: 'Filter by title or number' }), 'ORDER');
    expect(numbersOf(table)).toEqual(['64', '61', '45', '41']);
  });

  it('narrows the table to the issues whose number holds the text, with or without the hash', async () => {
    const { view, table } = await openTable();
    const search = screen.getByRole('searchbox', { name: 'Filter by title or number' });
    await view.user.type(search, '#45');
    expect(numbersOf(table)).toEqual(['45']);
    await view.user.clear(search);
    await view.user.type(search, '5');
    expect(numbersOf(table)).toEqual(['75', '58', '55', '52', '45']);
  });

  it('narrows the table to the issues of a type', async () => {
    const { view, table } = await openTable();
    await view.user.selectOptions(screen.getByRole('combobox', { name: 'Issue type' }), 'ui');
    expect(numbersOf(table)).toEqual(['77', '66', '55', '49', '45', '28']);
  });

  it('offers every type of the project, named in the language of the page', async () => {
    await openTable();
    const options = within(screen.getByRole('combobox', { name: 'Issue type' })).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['All types', 'Feature', 'Fix', 'UI', 'API', 'Security', 'Infrastructure and CI', 'Data', 'Dependencies', 'Documentation', 'Refactoring', 'Release', 'Prompt']);
  });

  it('combines the group, the type and the text', async () => {
    const { view, table } = await openTable();
    await view.user.click(within(screen.getByRole('radiogroup', { name: 'Filter the issues by progress' })).getByRole('radio', { name: /In progress/ }));
    await view.user.selectOptions(screen.getByRole('combobox', { name: 'Issue type' }), 'ui');
    expect(numbersOf(table)).toEqual(['66', '55', '45']);
    await view.user.type(screen.getByRole('searchbox', { name: 'Filter by title or number' }), 'screen reader');
    expect(numbersOf(table)).toEqual(['55']);
  });

  it('says that no issue matches and gives the filters back on request', async () => {
    const { view } = await openTable();
    const search = screen.getByRole('searchbox', { name: 'Filter by title or number' });
    expect(screen.queryByRole('button', { name: 'Clear the filters' })).not.toBeInTheDocument();
    await view.user.type(search, 'no such issue');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('No issue matches these filters')).toBeInTheDocument();
    expect(screen.getByText('0 of 20 issues')).toBeInTheDocument();
    await view.user.click(screen.getByRole('button', { name: 'Clear the filters' }));
    const table = screen.getByRole('table', { name: 'Issues of the project' });
    expect(numbersOf(table)).toEqual(STOREFRONT_NUMBERS);
    expect(search).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Issue type' })).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear the filters' })).not.toBeInTheDocument();
  });

  it('says how many issues of the project pass the filter, in the singular for a single issue', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT, (project) => ({ ...project, issues: project.issues.slice(0, 1) }));
    await openTable(issuesPath(STOREFRONT), { snapshot });
    expect(screen.getByText('1 of 1 issue')).toBeInTheDocument();
  });

  it('offers a type that issues carry although the project does not declare it', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.stockLevelOnProduct, (issue) => ({ ...issue, type: 'billing' }));
    const { view, table } = await openTable(issuesPath(STOREFRONT), { snapshot });
    const type = screen.getByRole('combobox', { name: 'Issue type' });
    expect(within(type).getByRole('option', { name: 'billing' })).toBeInTheDocument();
    await view.user.selectOptions(type, 'billing');
    expect(numbersOf(table)).toEqual(['77']);
    expect(rowOf(table, /Show the stock level/)).toHaveTextContent('billing');
  });

});

describe('IssuesView display', () => {
  it('shows the table by default, with the choice between the table and the graph', async () => {
    await openTable();
    const display = screen.getByRole('radiogroup', { name: 'Display' });
    expect(within(display).getByRole('radio', { name: 'Table' })).toBeChecked();
    expect(within(display).getByRole('radio', { name: 'Graph' })).not.toBeChecked();
    expect(screen.queryByRole('region', { name: 'Dependency graph of the issues' })).not.toBeInTheDocument();
  });

  it('draws the graph when the address asks for it', async () => {
    await renderRoute(`${issuesPath(STOREFRONT)}?view=graph`);
    expect(await screen.findByRole('region', { name: 'Dependency graph of the issues' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Graph' })).toBeChecked();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('puts the choice of the graph in the address and takes it out again for the table', async () => {
    const { view } = await openTable();
    await view.user.click(screen.getByRole('radio', { name: 'Graph' }));
    await view.expectLocation(`${issuesPath(STOREFRONT)}?view=graph`);
    expect(await screen.findByRole('region', { name: 'Dependency graph of the issues' })).toBeInTheDocument();
    await view.user.click(screen.getByRole('radio', { name: 'Table' }));
    await view.expectLocation(issuesPath(STOREFRONT));
    expect(await screen.findByRole('table', { name: 'Issues of the project' })).toBeInTheDocument();
  });

  it('keeps the filters of the table while the graph is shown, and does not apply them to the graph', async () => {
    const { view } = await openTable();
    await view.user.click(within(screen.getByRole('radiogroup', { name: 'Filter the issues by progress' })).getByRole('radio', { name: /Needs you/ }));
    await view.user.click(screen.getByRole('radio', { name: 'Graph' }));
    const nodes = within(await screen.findByRole('list', { name: 'Issues of the graph' })).getAllByRole('link');
    expect(nodes).toHaveLength(20);
    await view.user.click(screen.getByRole('radio', { name: 'Table' }));
    expect(numbersOf(await screen.findByRole('table', { name: 'Issues of the project' }))).toEqual(['75', '52', '49']);
  });

  it('keeps the other parts of the address when the display changes', async () => {
    const view = await renderRoute(`${issuesPath(STOREFRONT)}?highlight=49`);
    await screen.findByRole('table', { name: 'Issues of the project' });
    await view.user.click(screen.getByRole('radio', { name: 'Graph' }));
    await view.expectLocation(`${issuesPath(STOREFRONT)}?highlight=49&view=graph`);
    await view.user.click(await screen.findByRole('radio', { name: 'Table' }));
    await view.expectLocation(`${issuesPath(STOREFRONT)}?highlight=49`);
  });

});

describe('IssuesView without issue', () => {
  it('says that the project holds no issue and where they come from', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT, (project) => ({ ...project, issues: [] }));
    await renderRoute(issuesPath(STOREFRONT), { snapshot });
    expect(await screen.findByText('No issue yet')).toBeInTheDocument();
    expect(screen.getByText('Issues appear here when a request is accepted or a validated issue is found on the forge.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the requests' })).toHaveAttribute('href', `/projects/${STOREFRONT}/requests`);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('says it as well in the graph', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT, (project) => ({ ...project, issues: [] }));
    await renderRoute(`${issuesPath(STOREFRONT)}?view=graph`, { snapshot });
    expect(await screen.findByText('No issue yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Dependency graph of the issues' })).not.toBeInTheDocument();
  });
});

describe('IssuesView issue not found', () => {
  it('says so when the project holds no issue with this number', async () => {
    await renderRoute(issuesPath(STOREFRONT, 9999));
    expect(await screen.findByRole('heading', { level: 1, name: 'Issue #9999 not found' })).toBeInTheDocument();
    expect(screen.getByText('This project holds no issue with this number.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All issues' })).toHaveAttribute('href', issuesPath(STOREFRONT));
  });

  it('does not find in a project an issue that only another project holds', async () => {
    await renderRoute(issuesPath(LEDGER, ISSUE.orderHistoryStatusFilter));
    expect(await screen.findByRole('heading', { level: 1, name: 'Issue #45 not found' })).toBeInTheDocument();
  });

  it('says so for an address that is not a number', async () => {
    await renderRoute(issuesPath(STOREFRONT, 'forty-five'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Issue #forty-five not found' })).toBeInTheDocument();
  });

  it('finds an issue whose number exists in both projects in the project of the address', async () => {
    await openIssue(ISSUE.localSetupDocs);
    expect(screen.getByRole('heading', { level: 1, name: 'Document the local development setup' })).toBeInTheDocument();
  });

  it('finds the issue of the other project that has the same number', async () => {
    await openIssue(LEDGER_ISSUE.paymentIdempotencyKey, {}, LEDGER);
    expect(screen.getByRole('heading', { level: 1, name: 'Accept an idempotency key on payment creation' })).toBeInTheDocument();
    expect(screen.queryByText('Document the local development setup')).not.toBeInTheDocument();
  });
});

describe('IssuesView in French', () => {
  it('words the page, the filters and the columns in French', async () => {
    const { table } = await openTable(issuesPath(STOREFRONT), { locale: 'fr' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Numéro', 'Titre', 'Type', 'État', 'Pull request', 'Mise à jour', 'Coût']);
    const groups = screen.getByRole('radiogroup', { name: 'Filtrer les issues par avancement' });
    expect(within(groups).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Toutes20', 'Vous concernent3', 'En cours6', 'En file3', 'Livrées7', 'Abandonnées1']);
    expect(within(screen.getByRole('radiogroup', { name: 'Affichage' })).getByRole('radio', { name: 'Graphe' })).toBeInTheDocument();
    expect(rowOf(table, /Show the savings of a promo code/)).toHaveTextContent('Pas encore de pull request');
    expect(rowOf(table, /Understand colour and price words/)).toHaveTextContent('Équivalent API');
    expect(rowOf(table, /Understand colour and price words/)).toHaveTextContent('Prête à merger');
  });

  it('uses the singular and the plural of the number of issues shown', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT, (project) => ({ ...project, issues: project.issues.slice(0, 1) }));
    const { view } = await openTable(issuesPath(STOREFRONT), { locale: 'fr', snapshot });
    expect(screen.getByText('1 sur 1 issue')).toBeInTheDocument();
    await view.user.type(screen.getByRole('searchbox', { name: 'Filtrer par titre ou numéro' }), 'introuvable');
    expect(screen.getByText('Aucune issue ne correspond à ces filtres')).toBeInTheDocument();
    expect(screen.getByText('0 sur 1 issue')).toBeInTheDocument();
  });

  it('counts the issues in the plural in French', async () => {
    await openTable(issuesPath(STOREFRONT), { locale: 'fr' });
    expect(screen.getByText('20 sur 20 issues')).toBeInTheDocument();
  });

  it('says that an issue is not found in French', async () => {
    await renderRoute(issuesPath(STOREFRONT, 9999), { locale: 'fr' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Issue n° 9999 introuvable' })).toBeInTheDocument();
  });
});
