import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CockpitSnapshot, FilmOrderView, FilmToolWaitView, FilmView, PullRequestView } from '../../contract/index.ts';
import { clickAndExpectCommand, expectCommand } from '../../test/commands.ts';
import { ISSUE, PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { fixtureSnapshot } from '../../test/render.tsx';
import { minutesAgo, openPullRequest, STOREFRONT, withPullRequest } from './pull-request-test-support.ts';

const SEARCH = PULL_REQUEST.naturalLanguageSearch;
const SEARCH_ISSUE = ISSUE.naturalLanguageSearch;
const MERGED = PULL_REQUEST.promoRounding;
const BASE_SHA = '1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const HEAD_SHA = '2222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SCREEN_BEFORE = '/api/projects/storefront/evidence/52/films/checkout-flow/before/screens/final.svg';

const filmsRegion = () => screen.getByRole('region', { name: 'Videos' });

function phase(name: 'before' | 'after', sha: string, facts: FilmView['before']['facts']): FilmView['before'] {
  return {
    sha,
    videoUrl: `/api/projects/storefront/evidence/52/films/checkout-flow/${name}/film.mp4`,
    screenshotUrls: name === 'before' ? [SCREEN_BEFORE] : [],
    facts,
  };
}

const FILM: FilmView = {
  scenario: 'checkout-flow',
  recordedAt: minutesAgo(12),
  before: phase('before', BASE_SHA, [{ label: 'Items in the cart', value: '0' }]),
  after: phase('after', HEAD_SHA, [{ label: 'Items in the cart', value: '2' }]),
};

function order(overrides: Partial<FilmOrderView> = {}): FilmOrderView {
  return { scenario: 'checkout-flow', operator: 'Alex Morgan', state: 'queued', expectedAt: null, filmsAhead: 0, reason: null, since: minutesAgo(5), ...overrides };
}

/** The storefront project films, and its search pull request carries what the test says about films. */
function filming(update: (pullRequest: PullRequestView) => PullRequestView = (pullRequest) => pullRequest, snapshot: CockpitSnapshot = fixtureSnapshot(), number: number = SEARCH): CockpitSnapshot {
  const enabled = mapProject(snapshot, STOREFRONT, (project) => ({ ...project, settings: { ...project.settings, films: { timeZone: 'Europe/Paris', timeoutMinutes: 20, tools: [] } } }));
  return withPullRequest(STOREFRONT, number, update, enabled);
}

describe('the videos of a pull request', () => {
  it('are left out for a project that films nothing', async () => {
    await openPullRequest(SEARCH);
    expect(screen.queryByRole('region', { name: 'Videos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Film' })).not.toBeInTheDocument();
  });

  it('say there is none yet for a project that films', async () => {
    await openPullRequest(SEARCH, { snapshot: filming() });
    expect(within(filmsRegion()).getByText('No video for this pull request')).toBeInTheDocument();
    expect(within(filmsRegion()).getByRole('button', { name: 'Film' })).toBeInTheDocument();
  });

  it('play a recorded scenario on the base and on the head, with their commits, screenshots and facts', async () => {
    await openPullRequest(SEARCH, { snapshot: filming((pullRequest) => ({ ...pullRequest, films: [FILM] })) });
    const film = within(filmsRegion()).getByRole('article', { name: 'Scenario checkout-flow' });
    expect(within(film).getByRole('heading', { name: 'checkout-flow' })).toBeInTheDocument();
    expect(within(film).getByText(/ago$/)).toHaveAttribute('datetime', FILM.recordedAt);
    const before = within(film).getByRole('region', { name: 'Before' });
    const after = within(film).getByRole('region', { name: 'After' });
    expect(within(before).getByText('1111111')).toBeInTheDocument();
    expect(within(after).getByText('2222222')).toBeInTheDocument();
    expect(within(before).getByLabelText('Before recording, scenario checkout-flow')).toHaveAttribute('src', FILM.before.videoUrl);
    expect(within(after).getByLabelText('After recording, scenario checkout-flow')).toHaveAttribute('src', FILM.after.videoUrl);
    expect(within(before).getByRole('img', { name: 'Before, scenario checkout-flow, screenshot 1' })).toHaveAttribute('src', SCREEN_BEFORE);
    expect(within(after).queryByRole('img')).not.toBeInTheDocument();
    expect(within(within(before).getByLabelText('Facts of the Before recording')).getByText('Items in the cart').nextElementSibling).toHaveTextContent('0');
    expect(within(within(after).getByLabelText('Facts of the After recording')).getByText('Items in the cart').nextElementSibling).toHaveTextContent('2');
  });

  it('show a film that waits, behind how many films, when it is expected and when the queue was read', async () => {
    const waiting = order({ filmsAhead: 2, expectedAt: '2026-10-12T10:40:00.000Z' });
    await openPullRequest(SEARCH, { snapshot: filming((pullRequest) => ({ ...pullRequest, filmOrders: [waiting] })) });
    const queued = within(filmsRegion()).getByRole('region', { name: 'Film of scenario checkout-flow' });
    expect(within(queued).getByText('Queued · scenario checkout-flow')).toBeInTheDocument();
    expect(within(queued).getByText('2 films ahead of this one.')).toBeInTheDocument();
    expect(within(queued).getByText(/^Expected around Oct 12, 2026, 12:40\sPM \(Europe\/Paris\)\.$/)).toBeInTheDocument();
    expect(within(queued).getByText('Ordered by Alex Morgan.')).toBeInTheDocument();
    expect(within(filmsRegion()).getByText(/^Read /)).toHaveAttribute('datetime', fixtureSnapshot().generatedAt);
  });

  it('tell the expected arrival in the zone of the reader once the project no longer films', async () => {
    const waiting = order({ expectedAt: '2026-10-12T10:40:00.000Z' });
    const snapshot = withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, filmOrders: [waiting] }));
    await openPullRequest(SEARCH, { snapshot });
    const queued = within(filmsRegion()).getByRole('region', { name: 'Film of scenario checkout-flow' });
    expect(within(queued).getByText(/^Expected around Oct 12, 2026, 10:40\sAM\.$/)).toBeInTheDocument();
    expect(within(filmsRegion()).queryByRole('button', { name: 'Film' })).not.toBeInTheDocument();
  });

  it.each([
    ['recording-base', 'Recording the base · scenario checkout-flow'],
    ['recording-head', 'Recording the head · scenario checkout-flow'],
    ['committing', 'Committing the recordings · scenario checkout-flow'],
  ] as const)('show a film that is in the stage %s', async (state, title) => {
    await openPullRequest(SEARCH, { snapshot: filming((pullRequest) => ({ ...pullRequest, filmOrders: [order({ state, filmsAhead: 0 })] })) });
    const running = within(filmsRegion()).getByRole('region', { name: 'Film of scenario checkout-flow' });
    expect(within(running).getByText(title)).toBeInTheDocument();
    expect(within(running).queryByText(/films? ahead/)).not.toBeInTheDocument();
  });

  it('show the reason a film failed, and drop the failure once the scenario is recorded', async () => {
    const failed = order({ state: 'failed', reason: 'the scenario was skipped: the sandbox account is locked' });
    await openPullRequest(SEARCH, { snapshot: filming((pullRequest) => ({ ...pullRequest, filmOrders: [failed] })) });
    const alert = within(filmsRegion()).getByRole('region', { name: 'Failed film of scenario checkout-flow' });
    expect(within(alert).getByText('The film of scenario checkout-flow failed')).toBeInTheDocument();
    expect(within(alert).getByText('the scenario was skipped: the sandbox account is locked')).toBeInTheDocument();
  });

  it('hide the failure of an earlier attempt when the scenario was recorded since', async () => {
    const snapshot = filming((pullRequest) => ({ ...pullRequest, films: [FILM], filmOrders: [order({ state: 'failed', reason: 'earlier' })] }));
    await openPullRequest(SEARCH, { snapshot });
    expect(screen.queryByRole('region', { name: 'Failed film of scenario checkout-flow' })).not.toBeInTheDocument();
    expect(within(filmsRegion()).getByRole('article', { name: 'Scenario checkout-flow' })).toBeInTheDocument();
  });

  it('keep the merge from going on, with the reason the factory gives next to Merge', async () => {
    const reason = 'films in progress, expected around 10:40 on 2026-10-12 (Europe/Paris)';
    const snapshot = filming((pullRequest) => ({ ...pullRequest, filmOrders: [order({ filmsAhead: 1 })], mergeable: false, mergeBlockers: [reason] }));
    await openPullRequest(SEARCH, { snapshot });
    expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled();
    expect(within(screen.getByRole('region', { name: 'Not mergeable yet' })).getByText(reason)).toBeInTheDocument();
  });

  it('are shown in French when the cockpit is', async () => {
    await openPullRequest(SEARCH, { snapshot: filming((pullRequest) => ({ ...pullRequest, films: [FILM], filmOrders: [order({ filmsAhead: 1, expectedAt: '2026-10-12T10:40:00.000Z' })] })), locale: 'fr' });
    const region = screen.getByRole('region', { name: 'Vidéos' });
    expect(within(region).getByRole('button', { name: 'Filmer' })).toBeInTheDocument();
    expect(within(region).getByText('En file d’attente · scénario checkout-flow')).toBeInTheDocument();
    expect(within(region).getByText('1 tournage devant celui-ci.')).toBeInTheDocument();
    expect(within(region).getByRole('article', { name: 'Scénario checkout-flow' })).toBeInTheDocument();
  });
});

const VAULT_LOGIN = 'vault login -method=oidc';

function toolWait(overrides: Partial<FilmToolWaitView> = {}): FilmToolWaitView {
  return {
    tool: 'vault',
    scope: 'installation',
    status: 'unauthenticated',
    detail: 'token expired',
    loginCommand: VAULT_LOGIN,
    fixCommand: null,
    since: minutesAgo(125),
    checkedAt: minutesAgo(4),
    ...overrides,
  };
}

/** The storefront films, waits for a tool, and its search pull request has the films the test says. */
function waitingForTool(wait: FilmToolWaitView | null, orders: readonly FilmOrderView[] = [order({ filmsAhead: 2, expectedAt: '2026-10-12T10:40:00.000Z' })]): CockpitSnapshot {
  const snapshot = filming((pullRequest) => ({ ...pullRequest, filmOrders: [...orders] }));
  return mapProject(snapshot, STOREFRONT, (project) => ({ ...project, filmToolWait: wait }));
}

describe('the videos of a pull request that wait for a tool', () => {
  const noticeRegion = () => within(filmsRegion()).getByRole('region', { name: 'Films waiting for vault' });

  it('name the tool, why its check fails, the login that restores it, since when they wait and when the tool was checked', async () => {
    await openPullRequest(SEARCH, { snapshot: waitingForTool(toolWait()) });
    const notice = noticeRegion();
    expect(within(notice).getByText('The films wait for vault')).toBeInTheDocument();
    expect(within(notice).getByText(/^Its check reports: Not signed in\./)).toHaveTextContent('Its check reports: Not signed in. token expired');
    expect(within(notice).getByText(VAULT_LOGIN)).toBeInTheDocument();
    expect(within(notice).getByText(/^The queued films stay queued and none fails\./)).toBeInTheDocument();
    expect(within(notice).getByText(/^The films have waited since/).querySelector('time')).toHaveAttribute('datetime', minutesAgo(125));
    expect(within(notice).getByText(/^Checked /)).toHaveAttribute('datetime', minutesAgo(4));
  });

  it('put the tool in place of the place in the queue and of the expected arrival', async () => {
    await openPullRequest(SEARCH, { snapshot: waitingForTool(toolWait()) });
    const queued = within(filmsRegion()).getByRole('region', { name: 'Film of scenario checkout-flow' });
    expect(within(queued).getByText('Waiting for vault · scenario checkout-flow')).toBeInTheDocument();
    expect(within(queued).queryByText(/films? ahead/)).not.toBeInTheDocument();
    expect(within(queued).queryByText(/^Expected around/)).not.toBeInTheDocument();
    expect(within(queued).getByText('Ordered by Alex Morgan.')).toBeInTheDocument();
  });

  it('show one notice for all the films of the pull request that wait', async () => {
    const orders = [order(), order({ scenario: 'order-history' })];
    await openPullRequest(SEARCH, { snapshot: waitingForTool(toolWait(), orders) });
    expect(within(filmsRegion()).getAllByRole('region', { name: 'Films waiting for vault' })).toHaveLength(1);
    expect(within(filmsRegion()).getAllByText(/^Waiting for vault · scenario /)).toHaveLength(2);
  });

  it('give the fix of the check when the tool declares no login, and offer no login', async () => {
    await openPullRequest(SEARCH, { snapshot: waitingForTool(toolWait({ loginCommand: null, fixCommand: 'brew install vault', status: 'missing' })) });
    const notice = noticeRegion();
    expect(within(notice).getByText(/^To fix it:/)).toBeInTheDocument();
    expect(within(notice).getByText('brew install vault')).toBeInTheDocument();
    expect(within(notice).getByText(/^Its check reports: Missing\./)).toBeInTheDocument();
    expect(within(notice).queryByRole('button', { name: 'Log in to vault' })).not.toBeInTheDocument();
    expect(within(notice).getByRole('button', { name: 'Check vault' })).toBeInTheDocument();
  });

  it('say when the tool declares neither, and leave out the detail the check did not give', async () => {
    await openPullRequest(SEARCH, { snapshot: waitingForTool(toolWait({ loginCommand: null, fixCommand: null, detail: '' })) });
    const notice = noticeRegion();
    expect(within(notice).getByText('The tool declares no login or fix command: restore it by hand.')).toBeInTheDocument();
    expect(within(notice).getByText(/^Its check reports: Not signed in\.$/)).toBeInTheDocument();
  });

  it('check the tool again on the order of the operator, and show what the factory found', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: waitingForTool(toolWait()) });
    view.transport.effects.set('tools.check', 'vault: unauthenticated');
    await clickAndExpectCommand(view.user, within(noticeRegion()).getByRole('button', { name: 'Check vault' }), view.transport, 'tools.check', { project: null, tool: 'vault' });
    expect(await within(screen.getByRole('status')).findByText('vault: unauthenticated')).toBeInTheDocument();
  });

  it('start the login of the tool, which the installation declares, without naming a project', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: waitingForTool(toolWait()) });
    view.transport.effects.set('tools.login', 'vault: login succeeded; the tool is now connected');
    const login = within(noticeRegion()).getByRole('button', { name: 'Log in to vault' });
    expect(login).toHaveAttribute('title', `Starts ${VAULT_LOGIN} on the factory’s machine.`);
    await clickAndExpectCommand(view.user, login, view.transport, 'tools.login', { project: null, tool: 'vault' });
    expect(await within(screen.getByRole('status')).findByText('vault: login succeeded; the tool is now connected')).toBeInTheDocument();
  });

  it.each([
    ['Log in to vault', 'tools.login'],
    ['Check vault', 'tools.check'],
  ] as const)('address a tool of the project through the project: %s', async (button, command) => {
    const view = await openPullRequest(SEARCH, { snapshot: waitingForTool(toolWait({ scope: 'project' })) });
    await clickAndExpectCommand(view.user, within(noticeRegion()).getByRole('button', { name: button }), view.transport, command, { project: STOREFRONT, tool: 'vault' });
  });

  it('show the refusal of the factory when the login fails', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: waitingForTool(toolWait()) });
    view.transport.commandFailure = 'vault declares no login the factory can start';
    await clickAndExpectCommand(view.user, within(noticeRegion()).getByRole('button', { name: 'Log in to vault' }), view.transport, 'tools.login', { project: null, tool: 'vault' });
    expect(await within(screen.getByRole('alert')).findByText('vault declares no login the factory can start')).toBeInTheDocument();
  });

  it('keep the buttons from sending twice while the factory answers', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: waitingForTool(toolWait()) });
    const release = view.transport.holdCommands();
    await view.user.click(within(noticeRegion()).getByRole('button', { name: 'Check vault' }));
    expect(within(noticeRegion()).getByRole('button', { name: 'Check vault' })).toBeDisabled();
    release();
  });

  it('are not announced when the films wait for nothing', async () => {
    await openPullRequest(SEARCH, { snapshot: waitingForTool(null) });
    expect(screen.queryByRole('region', { name: 'Films waiting for vault' })).not.toBeInTheDocument();
    expect(within(filmsRegion()).getByText('Queued · scenario checkout-flow')).toBeInTheDocument();
    expect(within(filmsRegion()).getByText('2 films ahead of this one.')).toBeInTheDocument();
  });

  it('are not announced for a pull request none of whose films is queued', async () => {
    await openPullRequest(SEARCH, { snapshot: waitingForTool(toolWait(), [order({ state: 'recording-head' })]) });
    expect(screen.queryByRole('region', { name: 'Films waiting for vault' })).not.toBeInTheDocument();
    expect(within(filmsRegion()).getByText('Recording the head · scenario checkout-flow')).toBeInTheDocument();
  });

  it('are shown in French when the cockpit is', async () => {
    await openPullRequest(SEARCH, { snapshot: waitingForTool(toolWait()), locale: 'fr' });
    const notice = within(screen.getByRole('region', { name: 'Vidéos' })).getByRole('region', { name: 'Tournages en attente de vault' });
    expect(within(notice).getByText('Les tournages attendent vault')).toBeInTheDocument();
    expect(within(notice).getByText(/^Son contrôle indique : Non connecté\./)).toBeInTheDocument();
    expect(within(notice).getByRole('button', { name: 'Se connecter à vault' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Vidéos' })).getByText('En attente de vault · scénario checkout-flow')).toBeInTheDocument();
  });
});

describe('the form that orders a film', () => {
  const orderButton = () => within(filmsRegion()).getByRole('button', { name: 'Film' });

  it('is offered on an open pull request of a project that films', async () => {
    await openPullRequest(SEARCH, { snapshot: filming() });
    expect(orderButton()).toBeEnabled();
  });

  it('is not offered on a pull request that is merged', async () => {
    await openPullRequest(MERGED, { snapshot: filming((pullRequest) => pullRequest, fixtureSnapshot(), MERGED) });
    expect(within(filmsRegion()).getByText('No video for this pull request')).toBeInTheDocument();
    expect(within(filmsRegion()).queryByRole('button', { name: 'Film' })).not.toBeInTheDocument();
  });

  it('refuses a name that is not a scenario, and sends nothing', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: filming() });
    await view.user.click(orderButton());
    const dialog = await screen.findByRole('dialog', { name: 'Film pull request #57' });
    await view.user.type(within(dialog).getByLabelText('Scenario name'), 'bad name');
    await view.user.click(within(dialog).getByRole('button', { name: 'Order the film' }));
    expect(within(dialog).getByText(/^This is not a scenario name\./)).toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('orders the film of a scenario on the issue of the pull request, and shows what the factory did', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: filming() });
    view.transport.effects.set('pr.film', 'The film of scenario checkout-flow is queued for issue #52 of storefront');
    await view.user.click(orderButton());
    const dialog = await screen.findByRole('dialog', { name: 'Film pull request #57' });
    expect(within(dialog).getByText(/^Letters, digits, dots, dashes and underscores/)).toBeInTheDocument();
    await view.user.type(within(dialog).getByLabelText('Scenario name'), ' checkout-flow ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Order the film' }));

    await expectCommand(view.transport, 'pr.film', { project: STOREFRONT, issueNumber: SEARCH_ISSUE, scenario: 'checkout-flow' });
    expect(await within(screen.getByRole('status')).findByText('The film of scenario checkout-flow is queued for issue #52 of storefront')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the refusal of the factory and keeps the form', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: filming() });
    view.transport.commandFailure = 'the film of scenario checkout-flow is already queued';
    await view.user.click(orderButton());
    const dialog = await screen.findByRole('dialog', { name: 'Film pull request #57' });
    await view.user.type(within(dialog).getByLabelText('Scenario name'), 'checkout-flow');
    await clickAndExpectCommand(view.user, within(dialog).getByRole('button', { name: 'Order the film' }), view.transport, 'pr.film', { project: STOREFRONT, issueNumber: SEARCH_ISSUE, scenario: 'checkout-flow' });

    expect(await within(screen.getByRole('alert')).findByText('the film of scenario checkout-flow is already queued')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Film pull request #57' })).toBeInTheDocument();
  });

  it('sends nothing when the operator cancels', async () => {
    const view = await openPullRequest(SEARCH, { snapshot: filming() });
    await view.user.click(orderButton());
    await view.user.click(within(await screen.findByRole('dialog', { name: 'Film pull request #57' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(view.transport.commands).toEqual([]);
  });
});
