import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithCockpit } from '../../test/render.tsx';
import { layoutIssueGraph } from './issue-graph-layout.ts';
import { IssuesView } from './IssuesView.tsx';
import { fixtureSnapshot } from '../../test/render.tsx';

const ROUTE = '/issues/:issueNumber?';

describe('IssuesView', () => {
  it('lists every issue with its state and dependencies', async () => {
    renderWithCockpit(<IssuesView />, { path: '/issues', route: ROUTE });
    const table = await screen.findByRole('table', { name: 'Issues' });
    expect(within(table).getAllByRole('row')).toHaveLength(15);
    expect(within(table).getByText('Hide several orders from the history at once')).toBeInTheDocument();
    expect(within(table).getAllByText('Intervention requise').length).toBeGreaterThan(0);
  });

  it('filters issues by group', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<IssuesView />, { path: '/issues', route: ROUTE });
    await screen.findByRole('table', { name: 'Issues' });
    await user.click(screen.getByRole('radio', { name: /À traiter/ }));
    const table = screen.getByRole('table', { name: 'Issues' });
    expect(within(table).getAllByRole('row')).toHaveLength(5);
  });

  it('navigates the table with the keyboard', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<IssuesView />, { path: '/issues', route: ROUTE });
    const table = await screen.findByRole('table', { name: 'Issues' });
    const rows = within(table).getAllByRole('row').slice(1);
    rows[0]?.focus();
    await user.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Show the payment provider and retry count on the order timeline' })).toBeInTheDocument();
  });

  it('draws the dependency graph left to right with one node per issue', async () => {
    renderWithCockpit(<IssuesView />, { path: '/issues?vue=graphe', route: ROUTE });
    const graph = await screen.findByRole('group', { name: 'Graphe des dépendances entre issues' });
    expect(within(graph).getAllByRole('link')).toHaveLength(14);
    expect(within(graph).getByRole('link', { name: /#229 Hide several orders from the history at once — Bloquée/ })).toBeInTheDocument();
  });

  it('places a dependency to the left of the issue that depends on it', () => {
    const layout = layoutIssueGraph(fixtureSnapshot().issues);
    const x = (number: number) => layout.nodes.find((node) => node.number === number)?.x ?? Number.NaN;
    expect(x(227)).toBeLessThan(x(229));
    expect(x(221)).toBeLessThan(x(227));
    expect(layout.edges).toContainEqual(expect.objectContaining({ from: 227, to: 229 }));
  });

  it('validates a draft spec', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<IssuesView />, { path: '/issues/231', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Valider la spec' }));
    await waitFor(() => expect(view.transport.commands).toEqual([{ name: 'issue.validate-spec', body: { issueNumber: 231 } }]));
  });

  it('shows the escalation and lets the operator have a frozen check rewritten', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<IssuesView />, { path: '/issues/225', route: ROUTE });
    expect(await screen.findByText(/Intervention requise depuis/)).toBeInTheDocument();
    expect(screen.getByText('L’agent attend votre réponse')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réécrire un check' }));
    const dialog = screen.getByRole('dialog', { name: 'Réécrire un check gelé' });
    await user.type(within(dialog).getByLabelText('Consigne'), 'On the French storefront, the badge shows « 4,20 € ».');
    await user.click(within(dialog).getByRole('button', { name: 'Demander la réécriture' }));
    await waitFor(() =>
      expect(view.transport.commands).toEqual([
        {
          name: 'issue.rewrite-check',
          body: { issueNumber: 225, path: 'e2e/history/savings-currency.spec.ts', instruction: 'On the French storefront, the badge shows « 4,20 € ».' },
        },
      ]),
    );
  });

  it('offers the rewrite of a frozen check while the pull request waits on CI', async () => {
    renderWithCockpit(<IssuesView />, { path: '/issues/224', route: ROUTE });
    expect(await screen.findByRole('button', { name: 'Réécrire un check' })).toBeInTheDocument();
  });

  it('offers no rewrite once the change is merged', async () => {
    renderWithCockpit(<IssuesView />, { path: '/issues/221', route: ROUTE });
    expect(await screen.findByText(/#221/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réécrire un check' })).not.toBeInTheDocument();
  });

  it('abandons an escalated issue with the operator reason', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<IssuesView />, { path: '/issues/225', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Abandonner' }));
    const dialog = screen.getByRole('dialog', { name: 'Abandonner #225' });
    await user.click(within(dialog).getByRole('button', { name: 'Abandonner l’issue' }));
    expect(within(dialog).getByText('Donnez la raison de l’abandon.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Raison'), '  La devise sera traitée dans une autre issue.  ');
    await user.click(within(dialog).getByRole('button', { name: 'Abandonner l’issue' }));
    await waitFor(() =>
      expect(view.transport.commands).toEqual([
        { name: 'issue.abandon', body: { issueNumber: 225, reason: 'La devise sera traitée dans une autre issue.' } },
      ]),
    );
  });

  it('shows acceptance checks with their before-proof and the attempt history', async () => {
    renderWithCockpit(<IssuesView />, { path: '/issues/226', route: ROUTE });
    expect(await screen.findByText('api/src/routes/orders/__tests__/pagination.test.ts')).toBeInTheDocument();
    expect(screen.getByText('Échoue sur la base')).toBeInTheDocument();
    expect(screen.getByText('Revue en échec')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Avancement dans la chaîne' })).toBeInTheDocument();
  });

  it('marks a kept-behaviour check that passes on base as expected and a new-behaviour check that passes as wrong', async () => {
    const snapshot = fixtureSnapshot();
    const issue = snapshot.issues.find((entry) => entry.number === 226);
    const check = issue?.checks[0];
    if (issue === undefined || check === undefined) throw new Error('issue 226 has no check');
    const kept = { ...check, path: 'app/test/kept.test.ts', onBase: 'passes' as const, before: { ...check.before, result: 'passed' as const } };
    const wrong = { ...check, path: 'app/test/wrong.test.ts', onBase: 'fails' as const, before: { ...check.before, result: 'passed' as const } };
    const issues = snapshot.issues.map((entry) => (entry.number === 226 ? { ...entry, checks: [kept, wrong] } : entry));
    renderWithCockpit(<IssuesView />, { path: '/issues/226', route: ROUTE, snapshot: { ...snapshot, issues } });
    const [keptBadge, wrongBadge] = await screen.findAllByText('Passe sur la base');
    expect(keptBadge?.closest('.ds-badge')?.className).toContain('success');
    expect(wrongBadge?.closest('.ds-badge')?.className).toContain('failed');
  });

  it('pauses an issue in progress', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<IssuesView />, { path: '/issues/227', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Mettre en pause' }));
    await waitFor(() => expect(view.transport.commands).toEqual([{ name: 'issue.pause', body: { issueNumber: 227 } }]));
  });
});
