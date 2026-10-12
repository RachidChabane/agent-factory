import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ISSUE as LEDGER_ISSUE } from '../../test/fixtures/ledger/ids.ts';
import { ISSUE } from '../../test/fixtures/storefront/ids.ts';
import { fixtureSnapshot, renderRoute } from '../../test/render.tsx';
import { layoutIssueGraph } from './issue-graph-layout.ts';
import { issuesPath, LEDGER, STOREFRONT, withIssue } from './issue-test-support.ts';

async function openGraph(project: string = STOREFRONT, options: Parameters<typeof renderRoute>[1] = {}) {
  const view = await renderRoute(`${issuesPath(project)}?view=graph`, options);
  const label = options.locale === 'fr' ? 'Graphe des dépendances entre issues' : 'Dependency graph of the issues';
  const graph = await screen.findByRole('region', { name: label });
  const nodes = within(graph).getByRole('list', { name: options.locale === 'fr' ? 'Issues du graphe' : 'Issues of the graph' });
  return { view, graph, nodes };
}

const nodeOf = (nodes: HTMLElement, number: number): HTMLElement => within(nodes).getByRole('link', { name: new RegExp(`#${number}\\b`) });

describe('IssueGraph nodes', () => {
  it('draws one node per issue of the project, each a link to the page of the issue', async () => {
    const { nodes } = await openGraph();
    const links = within(nodes).getAllByRole('link');
    expect(links).toHaveLength(20);
    expect(nodeOf(nodes, ISSUE.promoSavingsSummary)).toHaveAttribute('href', `/projects/${STOREFRONT}/issues/49`);
    expect(nodeOf(nodes, ISSUE.localSetupDocs)).toHaveAttribute('href', `/projects/${STOREFRONT}/issues/12`);
  });

  it('draws only the issues of the project of the address', async () => {
    const { nodes } = await openGraph(LEDGER);
    expect(within(nodes).getAllByRole('link')).toHaveLength(9);
    expect(nodeOf(nodes, LEDGER_ISSUE.paymentIdempotencyKey)).toHaveAttribute('href', `/projects/${LEDGER}/issues/12`);
    expect(nodeOf(nodes, LEDGER_ISSUE.paymentIdempotencyKey)).toHaveTextContent('Accept an idempotency key on payment creation');
  });

  it('names on each node its number, its type, its title and its state', async () => {
    const { nodes } = await openGraph();
    const node = nodeOf(nodes, ISSUE.promoSavingsSummary);
    expect(node).toHaveTextContent('#49');
    expect(node).toHaveTextContent('UI');
    expect(node).toHaveTextContent('Show the savings of a promo code in the cart summary');
    expect(node).toHaveTextContent('Needs a human');
    expect(nodeOf(nodes, ISSUE.deliveryDateEstimate)).toHaveTextContent('Blocked');
  });

  it('opens the issue of a node that is clicked', async () => {
    const { view, nodes } = await openGraph();
    await view.user.click(nodeOf(nodes, ISSUE.promoSavingsSummary));
    await view.expectLocation(`/projects/${STOREFRONT}/issues/49`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Show the savings of a promo code in the cart summary' })).toBeInTheDocument();
  });

  it('opens the issue of a node that has the focus when Enter is pressed', async () => {
    const { view, nodes } = await openGraph();
    nodeOf(nodes, ISSUE.deliveryDateEstimate).focus();
    await view.user.keyboard('{Enter}');
    await view.expectLocation(`/projects/${STOREFRONT}/issues/70`);
  });

  it('visits the nodes with the keyboard, what an issue waits for before the issue', async () => {
    const { view, nodes } = await openGraph();
    const names = within(nodes).getAllByRole('link').map((link) => /#(\d+)/.exec(link.textContent ?? '')?.[1]);
    expect(names.indexOf('61')).toBeLessThan(names.indexOf('70'));
    expect(names.indexOf('70')).toBeLessThan(names.indexOf('73'));
    nodeOf(nodes, ISSUE.savedDeliveryAddress).focus();
    await view.user.tab();
    expect(document.activeElement).toBe(within(nodes).getAllByRole('link')[names.indexOf('61') + 1]);
  });

  it('can be scrolled with the keyboard', async () => {
    const { graph } = await openGraph();
    graph.focus();
    expect(graph).toHaveFocus();
  });
});

describe('IssueGraph dependencies', () => {
  it('says on a node what it waits for, since the arrows are only drawn', async () => {
    const { nodes } = await openGraph();
    expect(nodeOf(nodes, ISSUE.deliveryDateEstimate)).toHaveAccessibleDescription('Waits for #61');
    expect(nodeOf(nodes, ISSUE.expressDelivery)).toHaveAccessibleDescription('Waits for #70');
    expect(nodeOf(nodes, ISSUE.savedDeliveryAddress)).not.toHaveAccessibleDescription();
  });

  it('draws as many dependencies as there are descriptions, and no more', async () => {
    const { nodes } = await openGraph();
    const described = within(nodes).getAllByRole('link').filter((link) => link.hasAttribute('aria-describedby'));
    expect(described).toHaveLength(2);
  });

  it('names every issue a node waits for', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.stockLevelOnProduct, (issue) => ({ ...issue, dependsOn: [ISSUE.localSetupDocs, ISSUE.orderHistoryPagination, ISSUE.localSetupDocs] }));
    const { nodes } = await openGraph(STOREFRONT, { snapshot });
    expect(nodeOf(nodes, ISSUE.stockLevelOnProduct)).toHaveAccessibleDescription('Waits for #12 and #41');
  });

  it('names on the node an issue the project does not hold instead of drawing an arrow to nowhere', async () => {
    const { nodes } = await openGraph(LEDGER);
    const node = nodeOf(nodes, LEDGER_ISSUE.creditNotes);
    expect(node).toHaveTextContent('Waits for #31 (not in this project)');
    expect(node).not.toHaveAccessibleDescription();
    expect(screen.getByText('No issue of this project waits for another one.')).toBeInTheDocument();
  });

  it('names all the missing issues of a node', async () => {
    const snapshot = withIssue(LEDGER, LEDGER_ISSUE.creditNotes, (issue) => ({ ...issue, dependsOn: [31, 32] }));
    const { nodes } = await openGraph(LEDGER, { snapshot });
    expect(nodeOf(nodes, LEDGER_ISSUE.creditNotes)).toHaveTextContent('Waits for #31 and #32 (not in this project)');
  });

  it('says both when an issue waits for one of the project and for one it does not hold', async () => {
    const snapshot = withIssue(LEDGER, LEDGER_ISSUE.creditNotes, (issue) => ({ ...issue, dependsOn: [31, LEDGER_ISSUE.paymentIdempotencyKey] }));
    const { nodes } = await openGraph(LEDGER, { snapshot });
    const node = nodeOf(nodes, LEDGER_ISSUE.creditNotes);
    expect(node).toHaveTextContent('Waits for #31 (not in this project)');
    expect(node).toHaveAccessibleDescription('Waits for #12');
  });

  it('shows no missing dependency on the issues of a project that holds them all', async () => {
    await openGraph();
    expect(screen.queryByText(/not in this project/)).not.toBeInTheDocument();
    expect(screen.queryByText('No issue of this project waits for another one.')).not.toBeInTheDocument();
  });
});

describe('IssueGraph legend', () => {
  it('names the marks the issues of the project carry, and the two kinds of dependency', async () => {
    await openGraph();
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'In progress',
      'Needs your action',
      'Succeeded',
      'Failed',
      'Blocked',
      'Waiting',
      'Dependency: the arrow points to the issue that waits',
      'Blocking dependency: not merged yet',
    ]);
  });

  it('leaves out the marks and the dependencies the project does not have', async () => {
    await openGraph(LEDGER);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['In progress', 'Needs your action', 'Succeeded', 'Waiting']);
  });

  it('names the blocking dependency only when one of the issues is blocked by it', async () => {
    const unblocked = withIssue(STOREFRONT, ISSUE.deliveryDateEstimate, (issue) => ({ ...issue, state: 'spec-validated' }));
    const snapshot = withIssue(STOREFRONT, ISSUE.expressDelivery, (issue) => ({ ...issue, state: 'spec-validated' }), unblocked);
    await openGraph(STOREFRONT, { snapshot });
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(legend).toHaveTextContent('Dependency: the arrow points to the issue that waits');
    expect(legend).not.toHaveTextContent('Blocking dependency: not merged yet');
  });
});

describe('IssueGraph zoom', () => {
  const zoom = () => within(screen.getByRole('group', { name: 'Zoom' }));

  it('starts at the natural size and cannot be reset', async () => {
    await openGraph();
    expect(zoom().getByRole('status', { name: 'Current zoom' })).toHaveTextContent('100%');
    expect(zoom().getByRole('button', { name: 'Reset the zoom' })).toBeDisabled();
  });

  it('zooms in and out by steps and resets', async () => {
    const { view } = await openGraph();
    await view.user.click(zoom().getByRole('button', { name: 'Zoom in' }));
    await view.user.click(zoom().getByRole('button', { name: 'Zoom in' }));
    expect(zoom().getByRole('status', { name: 'Current zoom' })).toHaveTextContent('120%');
    await view.user.click(zoom().getByRole('button', { name: 'Zoom out' }));
    expect(zoom().getByRole('status', { name: 'Current zoom' })).toHaveTextContent('110%');
    await view.user.click(zoom().getByRole('button', { name: 'Reset the zoom' }));
    expect(zoom().getByRole('status', { name: 'Current zoom' })).toHaveTextContent('100%');
  });

  it('stops zooming in at the largest size and zooming out at the smallest', async () => {
    const { view } = await openGraph();
    for (let step = 0; step < 6; step += 1) await view.user.click(zoom().getByRole('button', { name: 'Zoom in' }));
    expect(zoom().getByRole('status', { name: 'Current zoom' })).toHaveTextContent('160%');
    expect(zoom().getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    await view.user.click(zoom().getByRole('button', { name: 'Reset the zoom' }));
    for (let step = 0; step < 6; step += 1) await view.user.click(zoom().getByRole('button', { name: 'Zoom out' }));
    expect(zoom().getByRole('status', { name: 'Current zoom' })).toHaveTextContent('40%');
    expect(zoom().getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  });

  it('keeps every node while zoomed', async () => {
    const { view, nodes } = await openGraph();
    await view.user.click(zoom().getByRole('button', { name: 'Zoom out' }));
    expect(within(nodes).getAllByRole('link')).toHaveLength(20);
  });
});

describe('IssueGraph circular dependencies', () => {
  it('shows no warning when no issues wait for each other', async () => {
    await openGraph();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('warns that issues which wait for each other can never start', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.savedDeliveryAddress, (issue) => ({ ...issue, dependsOn: [ISSUE.deliveryDateEstimate] }));
    await openGraph(STOREFRONT, { snapshot });
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Circular dependency');
    expect(note).toHaveTextContent('#61 and #70 wait for each other, so none of them can start.');
  });

  it('warns about an issue that waits for itself', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.stockLevelOnProduct, (issue) => ({ ...issue, dependsOn: [ISSUE.stockLevelOnProduct] }));
    await openGraph(STOREFRONT, { snapshot });
    expect(screen.getByRole('note')).toHaveTextContent('#77 waits for itself, so it cannot start.');
  });

  it('counts the circles when there are several', async () => {
    const first = withIssue(STOREFRONT, ISSUE.savedDeliveryAddress, (issue) => ({ ...issue, dependsOn: [ISSUE.deliveryDateEstimate] }));
    const snapshot = withIssue(STOREFRONT, ISSUE.stockLevelOnProduct, (issue) => ({ ...issue, dependsOn: [ISSUE.stockLevelOnProduct] }), first);
    await openGraph(STOREFRONT, { snapshot });
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('2 circular dependencies');
    expect(within(note).getAllByRole('listitem')).toHaveLength(2);
  });

  it('draws a graph with a circle without failing', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.savedDeliveryAddress, (issue) => ({ ...issue, dependsOn: [ISSUE.deliveryDateEstimate] }));
    const { nodes } = await openGraph(STOREFRONT, { snapshot });
    expect(within(nodes).getAllByRole('link')).toHaveLength(20);
  });
});

describe('IssueGraph in French', () => {
  it('words the graph, the legend, the nodes and the zoom in French', async () => {
    const { nodes } = await openGraph(STOREFRONT, { locale: 'fr' });
    expect(screen.getByRole('list', { name: 'Légende' })).toHaveTextContent('Dépendance bloquante : pas encore mergée');
    expect(nodeOf(nodes, ISSUE.deliveryDateEstimate)).toHaveAccessibleDescription('Attend #61');
    expect(nodeOf(nodes, ISSUE.deliveryDateEstimate)).toHaveTextContent('Bloquée');
    const zoom = within(screen.getByRole('group', { name: 'Zoom' }));
    expect(zoom.getByRole('button', { name: 'Zoomer' })).toBeInTheDocument();
    expect(zoom.getByRole('button', { name: 'Dézoomer' })).toBeInTheDocument();
    expect(zoom.getByRole('status', { name: 'Zoom actuel' })).toHaveTextContent('100 %');
  });

  it('names the issues the project does not hold in French', async () => {
    const { nodes } = await openGraph(LEDGER, { locale: 'fr' });
    expect(nodeOf(nodes, LEDGER_ISSUE.creditNotes)).toHaveTextContent('Attend #31 (hors de ce projet)');
  });

  it('words the circular dependencies in the singular and in the plural', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.stockLevelOnProduct, (issue) => ({ ...issue, dependsOn: [ISSUE.stockLevelOnProduct] }));
    await openGraph(STOREFRONT, { locale: 'fr', snapshot });
    expect(screen.getByRole('note')).toHaveTextContent('Dépendance circulaire');
    expect(screen.getByRole('note')).toHaveTextContent('#77 dépend d’elle-même : elle ne peut pas démarrer.');
  });
});

describe('layout of the fixture world', () => {
  it('draws the two dependencies of the storefront, both blocking, and none for the ledger', () => {
    const [storefront, ledger] = fixtureSnapshot().projects;
    const layout = layoutIssueGraph(storefront?.issues ?? []);
    expect(layout.nodes).toHaveLength(20);
    expect(layout.edges.map((edge) => [edge.from, edge.to, edge.blocking]).toSorted()).toEqual([
      [ISSUE.savedDeliveryAddress, ISSUE.deliveryDateEstimate, true],
      [ISSUE.deliveryDateEstimate, ISSUE.expressDelivery, true],
    ].toSorted());
    expect(layoutIssueGraph(ledger?.issues ?? []).edges).toEqual([]);
  });

  it('places what an issue waits for to its left', () => {
    const layout = layoutIssueGraph(fixtureSnapshot().projects[0]?.issues ?? []);
    const x = (number: number) => layout.nodes.find((node) => node.number === number)?.x ?? Number.NaN;
    expect(x(ISSUE.savedDeliveryAddress)).toBeLessThan(x(ISSUE.deliveryDateEstimate));
    expect(x(ISSUE.deliveryDateEstimate)).toBeLessThan(x(ISSUE.expressDelivery));
  });

  it('names the issue the ledger does not hold on the node that waits for it', () => {
    const layout = layoutIssueGraph(fixtureSnapshot().projects[1]?.issues ?? []);
    expect(layout.nodes.find((node) => node.number === LEDGER_ISSUE.creditNotes)?.missingDependencies).toEqual([31]);
    expect(layout.nodes.filter((node) => node.missingDependencies.length > 0)).toHaveLength(1);
  });
});
