import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { fixtureSnapshot, renderRoute } from '../../test/render.tsx';

async function openOverview(project: string, options: Parameters<typeof renderRoute>[1] = {}) {
  await renderRoute(`/projects/${project}`, options);
  await screen.findByRole('heading', { level: 1, name: project === 'storefront' ? 'Storefront' : 'Ledger' });
}

const section = (name = 'Delegated decisions') => screen.getByRole('region', { name });

describe('the delegated decisions of a project', () => {
  it('say what the project delegates and list what its orchestrator decided, newest first, each with its reason and its rule', async () => {
    await openOverview('storefront');
    const region = section();
    expect(within(region).getByText('orchestrator may:')).toBeInTheDocument();
    expect(within(region).getByText('validate specs')).toBeInTheDocument();
    expect(within(region).getByText('resume issues')).toBeInTheDocument();
    expect(within(region).getByText('merge the pull requests of Documentation')).toBeInTheDocument();
    expect(within(region).getByText(/merge the pull requests of .* once every film the spec declares is recorded/)).toBeInTheDocument();
    const decisions = within(region).getByRole('list', { name: 'Delegated decisions' });
    const items = within(decisions).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.delegated-decision__gesture')?.textContent)).toEqual(['Spec validated', 'Pull request merged', 'Issue resumed']);
    expect(within(items[1] as HTMLElement).getByText('Reason: A documentation change: every criterion is proven, the review is clean and only docs/ changed.')).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText('Allowed by autonomy.merge for docs')).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText('by orchestrator')).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByRole('link', { name: 'Pull request #14' })).toHaveAttribute('href', '/projects/storefront/pull-requests/14');
    expect(within(items[0] as HTMLElement).getByRole('link', { name: 'Issue #58' })).toHaveAttribute('href', '/projects/storefront/issues/58');
  });

  it('say that nothing is delegated and nothing was decided for a project that delegates nothing', async () => {
    await openOverview('ledger');
    expect(within(section()).getByText('Nothing is delegated: every gesture stays yours.')).toBeInTheDocument();
    expect(within(section()).getByText('Nothing was decided without you')).toBeInTheDocument();
    expect(within(section()).queryByRole('list', { name: 'Delegated decisions' })).not.toBeInTheDocument();
  });

  it('say that nothing was decided yet when the project delegates but its orchestrator has not acted', async () => {
    const snapshot = mapProject(fixtureSnapshot(), 'storefront', (project) => ({ ...project, delegatedDecisions: [] }));
    await openOverview('storefront', { snapshot });
    expect(within(section()).getByText('orchestrator may:')).toBeInTheDocument();
    expect(within(section()).getByText('Nothing was decided without you')).toBeInTheDocument();
  });

  it('are written in French when the cockpit is', async () => {
    await openOverview('storefront', { locale: 'fr' });
    const region = section('Décisions déléguées');
    expect(within(region).getByText('orchestrator peut :')).toBeInTheDocument();
    expect(within(region).getByText('valider les specs')).toBeInTheDocument();
    expect(within(region).getByText('Spec validée')).toBeInTheDocument();
    expect(within(region).getAllByText(/^Raison : /)).toHaveLength(3);
  });
});
