import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WorkflowRun } from '../../contract/index.ts';
import { clock, LEDGER, openDelivery, STOREFRONT, withWorkflows } from './delivery-test-support.ts';

const TABLE = { name: 'Workflow runs' } as const;

function runsTable(): HTMLElement {
  return within(screen.getByRole('region', { name: 'Workflow runs' })).getByRole('table', TABLE);
}

function bodyRows(): HTMLElement[] {
  return within(runsTable()).getAllByRole('row').slice(1);
}

function run(id: string, patch: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id,
    workflow: 'CI',
    title: `Run ${id}`,
    branch: 'main',
    sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
    trigger: 'push',
    status: 'completed',
    conclusion: 'success',
    actor: 'amorgan',
    startedAt: clock.minutesAgo(10),
    durationMs: 90_000,
    url: `https://github.example.com/example-org/storefront/actions/runs/${id}`,
    ...patch,
  };
}

const reading = (runs: WorkflowRun[] | null, patch: { readAt?: string | null; error?: string | null } = {}) => ({ value: runs, readAt: clock.minutesAgo(2), error: null, ...patch });

describe('DeliveryView workflow runs', () => {
  it('lists the runs of the forge, newest first', async () => {
    await openDelivery();
    const rows = bodyRows();
    expect(rows).toHaveLength(9);
    expect(rows[0]).toHaveTextContent('Visual regression');
    expect(rows[1]).toHaveTextContent('Deploy development');
    expect(rows.at(-1)).toHaveTextContent('Deploy production');
  });

  it('names the status of each run: queued, in progress, or the conclusion of a finished run', async () => {
    await openDelivery();
    const statuses = bodyRows().map((row) => within(row).getAllByRole('cell')[0]?.textContent);
    expect(statuses).toEqual(['Queued', 'In progress', 'Failed', 'Passed', 'Passed', 'Failed', 'Passed', 'Cancelled', 'Passed']);
  });

  it('shows the workflow, the branch, the commit, the trigger, the author and when the run started', async () => {
    await openDelivery();
    const row = bodyRows()[2];
    expect(row).toHaveTextContent('CI');
    expect(row).toHaveTextContent('fix(cart): tell customers when a promo code has expired');
    expect(row).toHaveTextContent('factory/58-expired-promo-message');
    expect(row).toHaveTextContent('Pull request');
    expect(row).toHaveTextContent('amorgan');
    expect(within(row as HTMLElement).getByText('20 min. ago')).toHaveAttribute('title', 'October 12, 2026 at 9:40:00 AM UTC');
  });

  it('puts the trigger of a run in words, and leaves a trigger it has no words for as the forge names it', async () => {
    const snapshot = withWorkflows(STOREFRONT, reading([run('1', { trigger: 'workflow_dispatch' }), run('2', { trigger: 'merge_group' })]));
    await openDelivery(STOREFRONT, { snapshot });
    const rows = bodyRows();
    expect(rows.map((row) => within(row).getAllByRole('cell')[5]?.textContent).sort()).toEqual(['Manual run', 'merge_group']);
  });

  it('says that the forge did not report who ran a workflow, instead of leaving the author blank', async () => {
    await openDelivery();
    const audit = bodyRows().find((row) => within(row).queryByText('Dependency audit') !== null);
    expect(audit).toBeDefined();
    expect(audit).toHaveTextContent('Schedule');
    expect(audit).toHaveTextContent('Not reported by the forge');
  });

  it('shows how long a finished run took, and that a run still going has not finished', async () => {
    await openDelivery();
    const rows = bodyRows();
    expect(rows[0]).toHaveTextContent('Not finished');
    expect(rows[1]).toHaveTextContent('Not finished');
    expect(rows[2]).toHaveTextContent('6 min 12 sec');
  });

  it('says that a finished run has no reported duration rather than showing a duration of zero', async () => {
    const snapshot = withWorkflows(STOREFRONT, reading([run('1', { durationMs: null })]));
    await openDelivery(STOREFRONT, { snapshot });
    expect(bodyRows()[0]).toHaveTextContent('Not reported');
  });

  it('opens each run on the forge in a new tab', async () => {
    await openDelivery();
    const links = within(runsTable()).getAllByRole('link');
    expect(links).toHaveLength(9);
    const first = links[0];
    expect(first).toHaveAttribute('href', 'https://github.example.com/example-org/storefront/actions/runs/9120531904');
    expect(first).toHaveAttribute('target', '_blank');
    expect(first).toHaveAttribute('rel', 'noreferrer');
    expect(first).toHaveAccessibleName('Open the run “feat(checkout): announce the errors of the address form to assistive technology” of Visual regression');
  });

  it('treats the link of a local forge like any other, in a new tab', async () => {
    const snapshot = withWorkflows(LEDGER, reading([run('9', { url: '/api/projects/ledger/forge/runs/9.md' })]));
    await openDelivery(LEDGER, { snapshot });
    const link = within(runsTable()).getByRole('link');
    expect(link).toHaveAttribute('href', '/api/projects/ledger/forge/runs/9.md');
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('DeliveryView workflow filter', () => {
  it('counts the runs of each filter', async () => {
    await openDelivery();
    const filter = screen.getByRole('radiogroup', { name: 'Filter the runs' });
    expect(within(filter).getByRole('radio', { name: /All/ })).toHaveTextContent('9');
    expect(within(filter).getByRole('radio', { name: /Running/ })).toHaveTextContent('2');
    expect(within(filter).getByRole('radio', { name: /Failed/ })).toHaveTextContent('2');
    expect(within(filter).getByRole('radio', { name: /All/ })).toBeChecked();
  });

  it('keeps the runs that have not finished', async () => {
    const view = await openDelivery();
    await view.user.click(screen.getByRole('radio', { name: /Running/ }));
    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual(['Queued', 'In progress']);
  });

  it('keeps the runs that failed, and not those that were cancelled', async () => {
    const view = await openDelivery();
    await view.user.click(screen.getByRole('radio', { name: /Failed/ }));
    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(within(row).getAllByRole('cell')[0]).toHaveTextContent('Failed');
    await view.user.click(screen.getByRole('radio', { name: /All/ }));
    expect(bodyRows()).toHaveLength(9);
  });

  it('says so when no run matches the filter', async () => {
    const snapshot = withWorkflows(STOREFRONT, reading([run('1'), run('2')]));
    const view = await openDelivery(STOREFRONT, { snapshot });
    await view.user.click(screen.getByRole('radio', { name: /Failed/ }));
    expect(screen.getByText('No run matches this filter')).toBeInTheDocument();
    expect(screen.queryByRole('table', TABLE)).not.toBeInTheDocument();
  });

  it('moves between the filters with the arrow keys', async () => {
    const view = await openDelivery();
    screen.getByRole('radio', { name: /All/ }).focus();
    await view.user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: /Running/ })).toBeChecked();
    expect(bodyRows()).toHaveLength(2);
  });
});

describe('DeliveryView workflow readings', () => {
  it('says that the forge of the project has no workflow runs', async () => {
    await openDelivery(LEDGER);
    expect(screen.getByText('This project’s forge has no workflow runs')).toBeInTheDocument();
    expect(screen.queryByRole('table', TABLE)).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Filter the runs' })).not.toBeInTheDocument();
  });

  it('says when the runs were read, without a warning when the reading is fresh', async () => {
    await openDelivery();
    const section = screen.getByRole('region', { name: 'Workflow runs' });
    expect(within(section).getByText(/^Read 4 min/)).toBeInTheDocument();
    expect(within(section).queryByText('Stale')).not.toBeInTheDocument();
  });

  it('marks an old reading stale', async () => {
    const snapshot = withWorkflows(STOREFRONT, reading([run('1')], { readAt: clock.minutesAgo(45) }));
    await openDelivery(STOREFRONT, { snapshot });
    expect(within(screen.getByRole('region', { name: 'Workflow runs' })).getByText('Stale')).toBeInTheDocument();
  });

  it('keeps the runs it read earlier and spells out why the latest read failed', async () => {
    const snapshot = withWorkflows(STOREFRONT, reading([run('1')], { readAt: clock.minutesAgo(50), error: 'GitHub API rate limit exceeded' }));
    await openDelivery(STOREFRONT, { snapshot });
    const section = screen.getByRole('region', { name: 'Workflow runs' });
    expect(within(section).getByText('The last read failed (GitHub API rate limit exceeded). This is the value read 50 min. ago.')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
  });

  it('says that the runs were never read', async () => {
    const snapshot = withWorkflows(STOREFRONT, { value: null, readAt: null, error: null });
    await openDelivery(STOREFRONT, { snapshot });
    expect(screen.getByText('Workflow runs not read yet')).toBeInTheDocument();
  });

  it('says that the read failed when nothing was kept, and why', async () => {
    const snapshot = withWorkflows(STOREFRONT, { value: null, readAt: null, error: 'GitHub API request failed: 403' });
    await openDelivery(STOREFRONT, { snapshot });
    const section = screen.getByRole('region', { name: 'Workflow runs' });
    expect(within(section).getByText('Could not be read')).toBeInTheDocument();
    expect(within(section).getByText('GitHub API request failed: 403')).toBeInTheDocument();
  });

  it('says that the forge holds no run yet', async () => {
    const snapshot = withWorkflows(STOREFRONT, reading([]));
    await openDelivery(STOREFRONT, { snapshot });
    expect(screen.getByText('No workflow run yet')).toBeInTheDocument();
    expect(screen.queryByRole('table', TABLE)).not.toBeInTheDocument();
  });
});

describe('DeliveryView workflow runs in French', () => {
  it('writes the table, the filter and the states in French', async () => {
    await openDelivery(STOREFRONT, { locale: 'fr' });
    const section = screen.getByRole('region', { name: 'Exécutions de workflows' });
    const table = within(section).getByRole('table', { name: 'Exécutions de workflows' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual(['En file', 'En cours', 'Échec', 'Réussi', 'Réussi', 'Échec', 'Réussi', 'Annulé', 'Réussi']);
    expect(within(section).getByRole('radiogroup', { name: 'Filtrer les exécutions' })).toBeInTheDocument();
    expect(within(table).getAllByText('Lancement manuel')).toHaveLength(2);
    expect(within(table).getByText('Non communiqué par la forge')).toBeInTheDocument();
    expect(within(table).getAllByText('Pas terminée')).toHaveLength(2);
  });
});
