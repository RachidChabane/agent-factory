import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand, expectCommand } from '../../test/commands.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { fixtureSnapshot, renderRoute } from '../../test/render.tsx';

const COLUMNS = ['Requests', 'Specs', 'Checks', 'Implementation', 'Pull requests', 'Needs a human', 'Delivered'] as const;

async function openBoard(path = '/', options: Parameters<typeof renderRoute>[1] = {}) {
  const view = await renderRoute(path, options);
  await screen.findByRole('region', { name: options.locale === 'fr' ? 'Implémentation' : 'Implementation' });
  return view;
}

const column = (name: (typeof COLUMNS)[number]) => screen.getByRole('region', { name });
const cardIn = (name: (typeof COLUMNS)[number], title: RegExp | string) => within(column(name)).getByRole('link', { name: title });
const articleOf = (title: RegExp | string) => within(column('Specs')).getByRole('article', { name: title });

describe('BoardView columns', () => {
  it('lays the pipeline out from requests to delivery', async () => {
    await openBoard();
    for (const name of COLUMNS) expect(column(name)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /Board/ })).toBeInTheDocument();
  });

  it('puts every request, issue and pull request in the column of its state', async () => {
    await openBoard();
    expect(cardIn('Requests', /Show where my parcel is/)).toBeInTheDocument();
    expect(cardIn('Requests', /Bill customers by usage/)).toBeInTheDocument();
    expect(cardIn('Specs', /Support credit notes/)).toBeInTheDocument();
    expect(cardIn('Specs', /Estimate the delivery date from the saved address/)).toBeInTheDocument();
    expect(cardIn('Checks', /Sort the search results by price/)).toBeInTheDocument();
    expect(cardIn('Implementation', /Filter the order history by status/)).toBeInTheDocument();
    expect(cardIn('Pull requests', /understand colour and price words/)).toBeInTheDocument();
    expect(cardIn('Needs a human', /Show the savings of a promo code in the cart summary/)).toBeInTheDocument();
    expect(cardIn('Delivered', /Paginate the order history endpoint/)).toBeInTheDocument();
  });

  it('shows a pull request once, as its own card in place of the issue it fixes', async () => {
    await openBoard();
    expect(within(column('Pull requests')).getAllByRole('link')).toHaveLength(4);
    expect(screen.queryByRole('link', { name: /Understand colour and price words in the product search/ })).not.toBeInTheDocument();
  });

  it('keeps abandoned issues, settled requests and old deliveries off the board', async () => {
    await openBoard();
    expect(screen.queryByRole('link', { name: /Replace the legacy date helpers/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Add a loyalty points scheme/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Customers do not understand why a promo code is refused/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Document the local development setup/ })).not.toBeInTheDocument();
  });

  it('links each card to its own page, in its own project', async () => {
    await openBoard();
    expect(cardIn('Implementation', /Filter the order history by status/)).toHaveAttribute('href', '/projects/storefront/issues/45');
    expect(cardIn('Pull requests', /understand colour and price words/)).toHaveAttribute('href', '/projects/storefront/pull-requests/57');
    expect(cardIn('Requests', /Show where my parcel is/)).toHaveAttribute('href', '/projects/storefront/requests/R-15');
    expect(cardIn('Specs', /Support credit notes/)).toHaveAttribute('href', '/projects/ledger/issues/30');
    expect(cardIn('Pull requests', /verify webhook signatures/)).toHaveAttribute('href', '/projects/ledger/pull-requests/22');
  });

  it('keeps the same request id apart in two projects', async () => {
    await openBoard();
    expect(cardIn('Requests', /Guest checkout loses the cart/)).toHaveAttribute('href', '/projects/storefront/requests/R-13');
    expect(cardIn('Requests', /Send a confirmation email when a refund is issued/)).toHaveAttribute('href', '/projects/ledger/requests/R-13');
  });
});

describe('BoardView spec validation', () => {
  it('offers to validate the spec of an issue the factory opened, on its card', async () => {
    const view = await openBoard();
    await clickAndExpectCommand(view.user, within(articleOf(/Pin the HTTP client timeout/)).getByRole('button', { name: 'Validate spec' }), view.transport, 'issue.validate-spec', {
      project: 'storefront',
      issueNumber: 75,
    });
  });

  it('validates in the project the card belongs to when two projects wait for a validation', async () => {
    const view = await openBoard();
    await clickAndExpectCommand(view.user, within(articleOf(/Support credit notes/)).getByRole('button', { name: 'Validate spec' }), view.transport, 'issue.validate-spec', {
      project: 'ledger',
      issueNumber: 30,
    });
  });

  it('offers it on the cards that wait for the validation and on no other card', async () => {
    await openBoard();
    expect(within(column('Specs')).getAllByRole('button', { name: 'Validate spec' })).toHaveLength(2);
    expect(within(articleOf(/Estimate the delivery date/)).queryByRole('button')).not.toBeInTheDocument();
    expect(within(column('Implementation')).queryByRole('button', { name: 'Validate spec' })).not.toBeInTheDocument();
  });

  it('keeps the card itself a link to the issue, apart from the button', async () => {
    await openBoard();
    const card = articleOf(/Pin the HTTP client timeout/);
    expect(within(card).getByRole('link', { name: /Pin the HTTP client timeout/ })).toHaveAttribute('href', '/projects/storefront/issues/75');
    expect(within(card).getByRole('link', { name: /Pin the HTTP client timeout/ })).not.toHaveTextContent('Validate spec');
  });

  it('writes the action in French', async () => {
    await openBoard('/', { locale: 'fr' });
    expect(within(screen.getByRole('region', { name: 'Specs' })).getAllByRole('button', { name: 'Valider la spec' })).toHaveLength(2);
  });
});

describe('BoardView cards', () => {
  it('says what the agent at work says, under the name of the agent', async () => {
    await openBoard();
    const card = cardIn('Implementation', /Filter the order history by status/);
    expect(within(card).getByText('Implementing · Implementer')).toBeInTheDocument();
    expect(within(card).getByText('Claude')).toBeInTheDocument();
  });

  it('shows why a queued issue cannot start yet', async () => {
    await openBoard();
    expect(within(cardIn('Specs', /Estimate the delivery date/)).getByText('Blocked · Waiting for #61')).toBeInTheDocument();
    expect(within(cardIn('Specs', /Offer an express delivery option/)).getByText('Blocked · Waiting for #70')).toBeInTheDocument();
  });

  it('flags what needs the operator, in the words of the action it asks for', async () => {
    await openBoard();
    expect(within(cardIn('Pull requests', /understand colour and price words/)).getByText('Merge to order')).toBeInTheDocument();
    expect(within(cardIn('Requests', /Show where my parcel is/)).getByText('Challenge to review')).toBeInTheDocument();
    expect(within(cardIn('Requests', /Guest checkout loses the cart/)).getByText('Challenge to start')).toBeInTheDocument();
    expect(within(articleOf(/Pin the HTTP client timeout/)).getByRole('button', { name: 'Validate spec' })).toBeInTheDocument();
    expect(within(cardIn('Needs a human', /Show the savings of a promo code/)).getByText('Agent question')).toBeInTheDocument();
  });

  it('summarises a pull request: its issue, its checks and its evidence', async () => {
    await openBoard();
    expect(within(cardIn('Pull requests', /understand colour and price words/)).getByText('Ready to merge · Issue #52 · Checks passing · Evidence complete')).toBeInTheDocument();
    expect(within(cardIn('Pull requests', /announce the errors of the address form/)).getByText(/Evidence incomplete/)).toBeInTheDocument();
  });

  it('says that the checks of a pull request were read too long ago to be current', async () => {
    await openBoard();
    expect(within(cardIn('Pull requests', /announce the errors of the address form/)).getByText(/Checks (passing|failing|running|none) \(stale\)/)).toBeInTheDocument();
    expect(within(cardIn('Pull requests', /understand colour and price words/)).queryByText(/\(stale\)/)).not.toBeInTheDocument();
  });

  it('says that the checks of a pull request were never read', async () => {
    const snapshot = mapProject(fixtureSnapshot(), 'storefront', (project) => ({
      ...project,
      pullRequests: project.pullRequests.map((pullRequest) => (pullRequest.number === 62 ? { ...pullRequest, checks: { value: null, readAt: null, error: null } } : pullRequest)),
    }));
    await openBoard('/', { snapshot });
    expect(within(cardIn('Pull requests', /tell customers when a promo code has expired/)).getByText(/Checks not read/)).toBeInTheDocument();
  });

  it('shows the project of each card while all projects are shown', async () => {
    await openBoard();
    const card = cardIn('Specs', /Support credit notes/);
    expect(within(card).getByText('Ledger')).toBeInTheDocument();
    expect(within(cardIn('Specs', /Show the stock level on the product page/)).getByText('Storefront')).toBeInTheDocument();
  });
});

describe('BoardView project filter', () => {
  it('offers all projects and each project', async () => {
    await openBoard();
    const filter = screen.getByRole('radiogroup', { name: 'Project' });
    expect(within(filter).getByRole('radio', { name: 'All projects' })).toBeChecked();
    expect(within(filter).getByRole('radio', { name: 'Storefront' })).toBeInTheDocument();
    expect(within(filter).getByRole('radio', { name: 'Ledger' })).toBeInTheDocument();
  });

  it('shows one project only, and keeps the choice in the address', async () => {
    const view = await openBoard();
    await view.user.click(screen.getByRole('radio', { name: 'Ledger' }));
    await view.expectLocation('/?project=ledger');
    expect(screen.getByRole('radio', { name: 'Ledger' })).toBeChecked();
    expect(screen.queryByRole('link', { name: /Filter the order history by status/ })).not.toBeInTheDocument();
    expect(cardIn('Specs', /Support credit notes/)).toBeInTheDocument();
    expect(within(cardIn('Specs', /Support credit notes/)).queryByText('Ledger')).not.toBeInTheDocument();
    await view.user.click(screen.getByRole('radio', { name: 'All projects' }));
    await view.expectLocation('/');
    expect(cardIn('Implementation', /Filter the order history by status/)).toBeInTheDocument();
  });

  it('starts on the project named in the address and ignores an unknown one', async () => {
    await openBoard('/?project=storefront');
    expect(screen.getByRole('radio', { name: 'Storefront' })).toBeChecked();
    expect(screen.queryByRole('link', { name: /Support credit notes/ })).not.toBeInTheDocument();
  });

  it('shows every project when the address names an unknown one', async () => {
    await openBoard('/?project=nowhere');
    expect(screen.getByRole('radio', { name: 'All projects' })).toBeChecked();
    expect(screen.getByRole('link', { name: /Support credit notes/ })).toBeInTheDocument();
  });
});

describe('BoardView filters', () => {
  it('filters by words of the title', async () => {
    const view = await openBoard();
    await view.user.type(screen.getByPlaceholderText(/Filter by title/), 'pagination');
    expect(screen.queryByRole('link', { name: /Filter the order history by status/ })).not.toBeInTheDocument();
    expect(screen.getByText(/1 in total/)).toBeInTheDocument();
    expect(cardIn('Delivered', /Paginate the order history endpoint/)).toBeInTheDocument();
  });

  it('says that nothing matches in every column, and clears with Escape', async () => {
    const view = await openBoard();
    const field = screen.getByPlaceholderText(/Filter by title/);
    await view.user.type(field, 'zzzz');
    expect(screen.getByText('No agent at work')).toBeInTheDocument();
    expect(screen.getByText('0 in total')).toBeInTheDocument();
    await view.user.keyboard('{Escape}');
    expect(field).toHaveValue('');
    expect(cardIn('Implementation', /Filter the order history by status/)).toBeInTheDocument();
  });

  it('filters the agents at work with the same words', async () => {
    const view = await openBoard();
    const live = screen.getByRole('region', { name: 'Runs in progress' });
    expect(within(live).getAllByRole('link')).toHaveLength(2);
    await view.user.type(screen.getByPlaceholderText(/Filter by title/), 'order history');
    expect(within(live).getAllByRole('link')).toHaveLength(1);
    expect(within(live).getByRole('link')).toHaveAttribute('href', '/runs/run_7f3a2c');
  });

  it('shows only pull requests when asked to', async () => {
    const view = await openBoard();
    await view.user.click(screen.getByRole('button', { name: /Filters/ }));
    await view.user.click(await screen.findByRole('checkbox', { name: 'Pull requests' }));
    expect(within(column('Pull requests')).getAllByRole('link')).toHaveLength(4);
    expect(within(column('Implementation')).queryByRole('link')).not.toBeInTheDocument();
    expect(within(column('Requests')).queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows only what needs the operator when asked to', async () => {
    const view = await openBoard();
    await view.user.click(screen.getByRole('button', { name: /Filters/ }));
    await view.user.click(await screen.findByRole('checkbox', { name: 'Only what needs you' }));
    expect(within(column('Implementation')).queryByRole('link')).not.toBeInTheDocument();
    expect(cardIn('Pull requests', /understand colour and price words/)).toBeInTheDocument();
    await view.user.click(screen.getByRole('button', { name: 'Reset the filters' }));
    expect(cardIn('Implementation', /Filter the order history by status/)).toBeInTheDocument();
  });

  it('focuses the filter field with the slash key', async () => {
    const view = await openBoard();
    await view.user.keyboard('/');
    expect(screen.getByPlaceholderText(/Filter by title/)).toHaveFocus();
  });
});

describe('BoardView keyboard', () => {
  it('moves focus between cards with the arrow keys', async () => {
    const view = await openBoard();
    const requests = within(column('Requests')).getAllByRole('link');
    requests[0]?.focus();
    await view.user.keyboard('{ArrowDown}');
    expect(requests[1]).toHaveFocus();
    await view.user.keyboard('{ArrowRight}');
    expect(within(column('Specs')).getAllByRole('link')[1]).toHaveFocus();
    await view.user.keyboard('{ArrowUp}');
    expect(within(column('Specs')).getAllByRole('link')[0]).toHaveFocus();
  });
});

describe('BoardView running agents', () => {
  it('lists the agents at work, each one a link to its live log', async () => {
    await openBoard();
    const live = screen.getByRole('region', { name: 'Runs in progress' });
    const links = within(live).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href')).toSorted()).toEqual(['/runs/run_5d0911', '/runs/run_7f3a2c']);
    expect(within(live).getByText('Waiting for your answer')).toBeInTheDocument();
    expect(within(live).getByText(/Implementer · #45 Filter the order history by status/)).toBeInTheDocument();
  });

  it('says that no agent is running for a project that has none', async () => {
    await openBoard('/?project=ledger');
    expect(within(screen.getByRole('region', { name: 'Runs in progress' })).getByText('No agent is running.')).toBeInTheDocument();
  });
});

describe('BoardView pauses', () => {
  it('shows what pauses the installation and offers to pause the factory', async () => {
    const view = await openBoard();
    const scope = screen.getByRole('region', { name: 'Whole installation' });
    expect(within(scope).getByText('free memory 31% is below 40%')).toBeInTheDocument();
    expect(within(scope).getByText('Machine resources')).toBeInTheDocument();
    await view.user.click(within(scope).getByRole('button', { name: 'Pause the factory' }));
    await expectCommand(view.transport, 'scheduler.pause', { project: null });
  });

  it('shows no pause panel when nothing pauses the installation', async () => {
    const snapshot = fixtureSnapshot();
    await openBoard('/', { snapshot: { ...snapshot, installation: { ...snapshot.installation, pauses: [] } } });
    expect(screen.queryByRole('region', { name: 'Whole installation' })).not.toBeInTheDocument();
  });
});

describe('BoardView new request', () => {
  it('records a request for a chosen project, with the operator as the requester', async () => {
    const view = await openBoard();
    await view.user.click(screen.getByRole('button', { name: 'New request' }));
    const dialog = await screen.findByRole('dialog', { name: 'New request' });
    expect(within(dialog).getByLabelText('Project')).toHaveValue('storefront');
    expect(within(dialog).getByLabelText('Requester')).toHaveValue('Alex Morgan');
    await view.user.selectOptions(within(dialog).getByLabelText('Project'), 'ledger');
    await view.user.type(within(dialog).getByLabelText('Title'), 'Show the due date on invoices');
    await view.user.type(within(dialog).getByLabelText('Request text'), 'Customers ask for the due date next to the total.');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the request' }));
    await expectCommand(view.transport, 'request.create', {
      project: 'ledger',
      title: 'Show the due date on invoices',
      requester: 'Alex Morgan',
      body: 'Customers ask for the due date next to the total.',
      attachments: [],
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New request' })).not.toBeInTheDocument());
  });

  it('offers the project the board is filtered on first', async () => {
    const view = await openBoard('/?project=ledger');
    await view.user.click(screen.getByRole('button', { name: 'New request' }));
    expect(within(await screen.findByRole('dialog', { name: 'New request' })).getByLabelText('Project')).toHaveValue('ledger');
  });

  it('shows what is missing and sends nothing while the form is incomplete', async () => {
    const view = await openBoard();
    await view.user.click(screen.getByRole('button', { name: 'New request' }));
    const dialog = await screen.findByRole('dialog', { name: 'New request' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the request' }));
    expect(within(dialog).getByText('Give the request a short title.')).toBeInTheDocument();
    expect(within(dialog).getByText('Paste the text of the request.')).toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('shows the refusal of the factory and keeps the dialog open', async () => {
    const view = await openBoard();
    await view.user.click(screen.getByRole('button', { name: 'New request' }));
    const dialog = await screen.findByRole('dialog', { name: 'New request' });
    view.transport.commandFailure = 'the requests folder is read-only';
    await view.user.type(within(dialog).getByLabelText('Title'), 'Anything');
    await view.user.type(within(dialog).getByLabelText('Request text'), 'Anything at all.');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the request' }));
    expect(await within(screen.getByRole('alert')).findByText('the requests folder is read-only')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New request' })).toBeInTheDocument();
  });
});

describe('BoardView with a single project', () => {
  it('hides the project filter and the project tags', async () => {
    const snapshot = fixtureSnapshot();
    await openBoard('/', { snapshot: { ...snapshot, projects: snapshot.projects.filter((project) => project.id === 'storefront'), runs: snapshot.runs.filter((run) => run.project !== 'ledger') } });
    expect(screen.queryByRole('radiogroup', { name: 'Project' })).not.toBeInTheDocument();
    expect(within(cardIn('Specs', /Show the stock level/)).queryByText('Storefront')).not.toBeInTheDocument();
  });
});

describe('BoardView in French', () => {
  it('names the columns and the cards in French', async () => {
    await openBoard('/', { locale: 'fr' });
    expect(screen.getByRole('region', { name: 'Demandes' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Intervention requise' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Livré' })).toBeInTheDocument();
    expect(screen.getByText('Implémentation · Implémenteur')).toBeInTheDocument();
    expect(screen.getAllByText('Challenge à relire')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Nouvelle demande' })).toBeInTheDocument();
  });

  it('counts in French with the plural of the language', async () => {
    const snapshot = mapProject(fixtureSnapshot(), 'storefront', (project) => project);
    await openBoard('/', { locale: 'fr', snapshot });
    expect(screen.getByText(/au total/)).toBeInTheDocument();
  });
});
