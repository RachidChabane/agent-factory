import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand, expectCommand } from '../../test/commands.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { fixtureSnapshot, renderRoute } from '../../test/render.tsx';

async function openOverview(project: string, options: Parameters<typeof renderRoute>[1] = {}) {
  const view = await renderRoute(`/projects/${project}`, options);
  await screen.findByRole('heading', { level: 1, name: project === 'storefront' ? 'Storefront' : 'Ledger' });
  return view;
}

describe('ProjectOverview header', () => {
  it('names the project, its repository and its base branch', async () => {
    await openOverview('storefront');
    expect(screen.getByText('example-org/storefront · base branch main')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('opens the repository of a project on a remote forge in a new tab', async () => {
    await openOverview('storefront');
    const link = screen.getByRole('link', { name: /Open the repository/ });
    expect(link).toHaveAttribute('href', 'https://github.example.com/example-org/storefront');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('offers no repository link for a local forge', async () => {
    await openOverview('ledger');
    expect(screen.getByText('Local forge')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open the repository/ })).not.toBeInTheDocument();
  });
});

describe('ProjectOverview figures', () => {
  it('counts what the project holds, each figure a link to its page', async () => {
    await openOverview('storefront');
    const figures = screen.getByRole('list', { name: 'Project figures' });
    const figure = (label: string) => within(figures).getByText(label).closest('a');
    expect(figure('Open issues')).toHaveTextContent('18');
    expect(figure('Open issues')).toHaveTextContent('20 in total');
    expect(figure('Open issues')).toHaveAttribute('href', '/projects/storefront/issues');
    expect(figure('Open pull requests')).toHaveTextContent('3');
    expect(figure('Runs in progress')).toHaveTextContent('2');
    expect(figure('Runs in progress')).toHaveAttribute('href', '/runs?project=storefront');
    expect(figure('Requests to handle')).toHaveTextContent('3');
    expect(figure('Audits to handle')).toHaveTextContent('1');
    expect(figure('Releases to handle')).toHaveTextContent('2');
    expect(figure('Releases to handle')).toHaveAttribute('href', '/projects/storefront/releases');
  });

  it('counts only the runs of the project', async () => {
    await openOverview('ledger');
    const figures = screen.getByRole('list', { name: 'Project figures' });
    expect(within(figures).getByText('Runs in progress').closest('a')).toHaveTextContent('0');
  });
});

describe('ProjectOverview attention', () => {
  it('lists what waits for the operator, most urgent first, each item a link', async () => {
    await openOverview('storefront');
    const section = screen.getByRole('region', { name: 'Needs you' });
    const kinds = within(section)
      .getAllByRole('link')
      .map((link) => link.querySelector('.overview-attention__kind')?.textContent);
    expect(kinds).toEqual([
      'Your decision is needed',
      'Agent question',
      'Merge to order',
      'Release to handle',
      'Release to handle',
      'Audit to handle',
      'Challenge to review',
      'Validate spec',
      'Challenge to start',
      'Challenge to start',
    ]);
    expect(within(section).getByRole('link', { name: /Show the savings of a promo code/ })).toHaveAttribute('href', '/projects/storefront/issues/49');
    expect(within(section).getByRole('link', { name: /understand colour and price words/ })).toHaveAttribute('href', '/projects/storefront/pull-requests/57?merge=1');
  });

  it('says that nothing waits for the operator in a project that has nothing to decide', async () => {
    const snapshot = mapProject(fixtureSnapshot(), 'ledger', (project) => ({
      ...project,
      requests: project.requests.filter((request) => request.state === 'accepted'),
      issues: project.issues.filter((issue) => issue.state !== 'spec-draft'),
      pullRequests: project.pullRequests.filter((pullRequest) => pullRequest.state === 'merged'),
      audits: [],
    }));
    await openOverview('ledger', { snapshot });
    expect(within(screen.getByRole('region', { name: 'Needs you' })).getByText('Nothing is waiting for you in this project.')).toBeInTheDocument();
  });
});

describe('ProjectOverview pauses', () => {
  it('offers to pause the project and the whole factory, and shows why the installation is paused', async () => {
    const view = await openOverview('storefront');
    const project = screen.getByRole('region', { name: 'This project' });
    expect(within(project).getByText('Running')).toBeInTheDocument();
    await clickAndExpectCommand(view.user, within(project).getByRole('button', { name: 'Pause this project' }), view.transport, 'scheduler.pause', { project: 'storefront' });
    const installation = screen.getByRole('region', { name: 'Whole installation' });
    expect(within(installation).getByText('free memory 31% is below 40%')).toBeInTheDocument();
    expect(within(installation).getByText('Lifts by itself when the machine has enough free memory again.')).toBeInTheDocument();
  });

  it('shows the pause of the operator on a paused project and resumes it', async () => {
    const view = await openOverview('ledger');
    const project = screen.getByRole('region', { name: 'This project' });
    expect(within(project).getByText('Operator')).toBeInTheDocument();
    expect(within(project).getByText('Paused by Alex Morgan to review the payment retries before anything else runs.')).toBeInTheDocument();
    expect(within(project).getByText('Stays paused until you resume it.')).toBeInTheDocument();
    await clickAndExpectCommand(view.user, within(project).getByRole('button', { name: 'Resume this project' }), view.transport, 'scheduler.resume', { project: 'ledger' });
  });

  it('resumes the whole installation when the operator paused it', async () => {
    const snapshot = fixtureSnapshot();
    const operatorPause = { scope: 'installation' as const, cause: 'operator' as const, reason: 'Paused by Alex Morgan', since: snapshot.generatedAt, resumesAt: null };
    const view = await openOverview('storefront', { snapshot: { ...snapshot, installation: { ...snapshot.installation, pauses: [operatorPause] } } });
    await clickAndExpectCommand(view.user, within(screen.getByRole('region', { name: 'Whole installation' })).getByRole('button', { name: 'Resume the factory' }), view.transport, 'scheduler.resume', { project: null });
  });
});

describe('ProjectOverview worktrees', () => {
  it('says in the scope of the project that its issues wait for a worktree, and who holds them', async () => {
    const snapshot = mapProject(fixtureSnapshot(), 'storefront', (project) => ({
      ...project,
      scheduler: { worktreeShortage: { since: '2026-10-12T09:40:00.000Z', poolSize: 2, waiting: [31], holders: [{ issueNumber: 22, state: 'pr-open', pullRequestNumber: 22 }, { issueNumber: 28, state: 'implementing', pullRequestNumber: null }] } },
    }));
    await openOverview('storefront', { snapshot });
    const project = screen.getByRole('region', { name: 'This project' });
    expect(within(project).getByText('Waiting for a worktree')).toBeInTheDocument();
    expect(project).toHaveTextContent('1 issue is ready but waits for a worktree: #31');
    expect(project).toHaveTextContent('All 2 worktrees of the pool are held by:');
    expect(within(project).getByRole('link', { name: 'pull request #22' })).toHaveAttribute('href', '/projects/storefront/pull-requests/22');
    expect(within(screen.getByRole('region', { name: 'Whole installation' })).queryByText('No free worktree')).not.toBeInTheDocument();
  });
});

describe('ProjectOverview board and runs', () => {
  it('embeds the board of the project alone', async () => {
    await openOverview('storefront');
    const implementation = screen.getByRole('region', { name: 'Implementation' });
    expect(within(implementation).getByRole('link', { name: /Filter the order history by status/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Support credit notes/ })).not.toBeInTheDocument();
  });

  it('lists the agents at work in the project', async () => {
    await openOverview('storefront');
    const live = screen.getByRole('region', { name: 'Runs in progress' });
    expect(within(live).getAllByRole('link')).toHaveLength(2);
  });
});

describe('ProjectOverview environments', () => {
  it('shows each environment with its status and what is deployed, and when that was read', async () => {
    await openOverview('storefront');
    const environments = screen.getByRole('region', { name: 'Environments' });
    const production = within(environments).getByRole('link', { name: 'production' }).closest('li');
    expect(production).toHaveTextContent('Healthy');
    expect(production).toHaveTextContent('Deployed version 1.8.0');
    expect(production).toHaveTextContent(/Read 3 min/);
    const development = within(environments).getByRole('link', { name: 'development' }).closest('li');
    expect(development).toHaveTextContent('Deploying');
    expect(development).toHaveTextContent('Deployed version db98a40');
  });

  it('keeps the version it read earlier and marks it stale with the error of the failed read', async () => {
    await openOverview('storefront');
    const staging = within(screen.getByRole('region', { name: 'Environments' })).getByRole('link', { name: 'staging' }).closest('li');
    expect(staging).toHaveTextContent('Deployed version 1.8.2');
    expect(staging).toHaveTextContent('Stale');
    expect(staging).toHaveTextContent('GitHub API request failed: 502 Bad Gateway');
  });

  it('says that no deployment source is configured, which is not the same as no deployment yet', async () => {
    await openOverview('ledger');
    const environments = screen.getByRole('region', { name: 'Environments' });
    expect(within(environments).getByRole('link', { name: 'staging' }).closest('li')).toHaveTextContent('No deployment source configured');
    expect(within(environments).getByRole('link', { name: 'production' }).closest('li')).toHaveTextContent('No deployment yet');
    expect(within(environments).getByRole('link', { name: 'production' }).closest('li')).toHaveTextContent('Down');
  });

  it('says that the deployments were never read when the factory has not read them', async () => {
    const snapshot = mapProject(fixtureSnapshot(), 'ledger', (project) => ({
      ...project,
      environments: project.environments.map((environment) => (environment.name === 'production' ? { ...environment, deployments: { value: null, readAt: null, error: null } } : environment)),
    }));
    await openOverview('ledger', { snapshot });
    expect(within(screen.getByRole('region', { name: 'Environments' })).getByRole('link', { name: 'production' }).closest('li')).toHaveTextContent('Deployments not read yet');
  });

  it('says that the project declares no environment', async () => {
    const snapshot = mapProject(fixtureSnapshot(), 'ledger', (project) => ({ ...project, environments: [] }));
    await openOverview('ledger', { snapshot });
    expect(screen.getByText('This project declares no environment.')).toBeInTheDocument();
  });

  it('links to the delivery page of the project', async () => {
    await openOverview('storefront');
    expect(screen.getByRole('link', { name: 'Open delivery' })).toHaveAttribute('href', '/projects/storefront/delivery');
  });
});

describe('ProjectOverview activity', () => {
  it('lists the latest events of the project only, newest first, linking to their subjects', async () => {
    await openOverview('storefront');
    const section = screen.getByRole('region', { name: 'Latest activity' });
    const items = within(section).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(3);
    expect(within(section).getByText('Issue #45 moved to implementing')).toBeInTheDocument();
    expect(within(section).queryByText(/Subscription usage of personal was read/)).not.toBeInTheDocument();
    expect(within(section).getByRole('link', { name: /Issue #45 moved to implementing/ })).toHaveAttribute('href', '/projects/storefront/issues/45');
  });

  it('adds an event that arrives from the stream at the top', async () => {
    const view = await openOverview('storefront');
    view.transport.emitFactory({ sequence: 1843, occurredAt: '2026-10-12T10:00:00.000Z', type: 'issue.transitioned', project: 'storefront', subject: 'issue/77', summary: 'Issue #77 moved to authoring-checks' });
    const section = screen.getByRole('region', { name: 'Latest activity' });
    await waitFor(() => expect(within(section).getAllByRole('listitem')[0]).toHaveTextContent('Issue #77 moved to authoring-checks'));
  });
});

describe('ProjectOverview new request', () => {
  it('records a request for this project without asking which one', async () => {
    const view = await openOverview('ledger');
    await view.user.click(screen.getByRole('button', { name: 'New request' }));
    const dialog = await screen.findByRole('dialog', { name: 'New request' });
    expect(within(dialog).queryByLabelText('Project')).not.toBeInTheDocument();
    await view.user.type(within(dialog).getByLabelText('Title'), 'Show the due date on invoices');
    await view.user.type(within(dialog).getByLabelText('Request text'), 'Customers ask for the due date.');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the request' }));
    await expectCommand(view.transport, 'request.create', {
      project: 'ledger',
      title: 'Show the due date on invoices',
      requester: 'Alex Morgan',
      body: 'Customers ask for the due date.',
      attachments: [],
    });
  });
});

describe('ProjectOverview in French', () => {
  it('writes the sections and the figures in French', async () => {
    const view = await renderRoute('/projects/storefront', { locale: 'fr' });
    await screen.findByRole('heading', { level: 1, name: 'Storefront' });
    expect(view.container).toHaveTextContent('branche de base main');
    expect(screen.getByRole('region', { name: 'Vous concerne' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Environnements' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Chiffres du projet' })).getByText('Issues ouvertes').closest('a')).toHaveTextContent('20 au total');
    expect(screen.getByRole('button', { name: 'Mettre ce projet en pause' })).toBeInTheDocument();
  });
});
