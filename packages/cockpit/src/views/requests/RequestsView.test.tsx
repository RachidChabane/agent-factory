import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mapProject, mapRuns } from '../../test/fixtures/mutate.ts';
import { runAt } from '../../test/minimal-snapshot.ts';
import { REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { REQUEST as LEDGER_REQUEST } from '../../test/fixtures/ledger/ids.ts';
import { fixtureSnapshot, renderRoute, TEST_NOW } from '../../test/render.tsx';
import { LEDGER, openRequest, requestsPath, STOREFRONT, withReport, withRequest } from './request-test-support.ts';

const idsOf = (region: HTMLElement): (string | undefined)[] => within(region).getAllByRole('link').map((link) => /R-\d+/.exec(link.textContent ?? '')?.[0]);

describe('RequestsView list', () => {
  it('groups the requests by what they ask of the operator, the most recently updated first', async () => {
    await renderRoute(requestsPath(STOREFRONT));
    expect(idsOf(await screen.findByRole('region', { name: 'Needs you' }))).toEqual([REQUEST.guestCheckout, REQUEST.returnsLabels, REQUEST.deliveryTracking]);
    expect(idsOf(screen.getByRole('region', { name: 'In progress' }))).toEqual([REQUEST.giftWrapping, REQUEST.wishlistSharing]);
    expect(idsOf(screen.getByRole('region', { name: 'Closed' }))).toEqual([REQUEST.promoExpiry, REQUEST.loyaltyPoints, REQUEST.orderHistory]);
  });

  it('counts the requests of the project and each group', async () => {
    await renderRoute(requestsPath(STOREFRONT));
    const list = await screen.findByRole('region', { name: 'Request list' });
    expect(within(list).getByRole('heading', { level: 1, name: /Requests/ })).toHaveTextContent(/Requests\s*8/);
    expect(within(list).getByText('Needs you · 3')).toBeInTheDocument();
    expect(within(list).getByText('In progress · 2')).toBeInTheDocument();
    expect(within(list).getByText('Closed · 3')).toBeInTheDocument();
  });

  it('shows for each request its title, identifier, requester, state, points and age', async () => {
    await renderRoute(requestsPath(STOREFRONT));
    const list = await screen.findByRole('region', { name: 'Request list' });
    const item = within(list).getByRole('link', { name: /Show where my parcel is/ });
    expect(item).toHaveTextContent('R-15');
    expect(item).toHaveTextContent('Riley Chen');
    expect(item).toHaveTextContent('Challenged · 4 points');
    expect(item).toHaveTextContent('5 hr. ago');
    expect(within(list).getByRole('link', { name: /Guest checkout loses the cart/ })).toHaveTextContent('Received');
  });

  it('opens the request that needs the operator most when none is named', async () => {
    await renderRoute(requestsPath(STOREFRONT));
    expect(await screen.findByRole('heading', { level: 1, name: 'Guest checkout loses the cart after the payment page' })).toBeInTheDocument();
  });

  it('selects the request named in the address', async () => {
    await openRequest(REQUEST.deliveryTracking);
    expect(screen.getByRole('heading', { level: 1, name: 'Show where my parcel is' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Needs you' })).getByRole('link', { name: /Show where my parcel is/ })).toHaveAttribute('aria-current', 'page');
    expect(within(screen.getByRole('region', { name: 'Needs you' })).getByRole('link', { name: /Guest checkout/ })).not.toHaveAttribute('aria-current');
  });

  it('looks a request up only among the requests of the project of the address', async () => {
    await openRequest(LEDGER_REQUEST.refundsByEmail, {}, LEDGER);
    expect(screen.getByRole('heading', { level: 1, name: 'Send a confirmation email when a refund is issued' })).toBeInTheDocument();
    expect(screen.queryByText('Guest checkout loses the cart after the payment page')).not.toBeInTheDocument();
  });

  it('lists only the requests of the project of the address', async () => {
    await renderRoute(requestsPath(LEDGER));
    const list = await screen.findByRole('region', { name: 'Request list' });
    expect(within(list).getAllByRole('link')).toHaveLength(3);
    expect(within(list).queryByText('Show where my parcel is')).not.toBeInTheDocument();
  });

  it('says so when the request does not exist', async () => {
    await renderRoute(requestsPath(STOREFRONT, 'R-99'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Request not found' })).toBeInTheDocument();
    expect(screen.getByText('The project holds no request with this identifier.')).toBeInTheDocument();
  });

  it('does not find in a project a request that only another project holds', async () => {
    await renderRoute(requestsPath(LEDGER, REQUEST.deliveryTracking));
    expect(await screen.findByRole('heading', { level: 1, name: 'Request not found' })).toBeInTheDocument();
  });

  it('says that a project holds no request and offers to record one', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT, (project) => ({ ...project, requests: [] }));
    const view = await renderRoute(requestsPath(STOREFRONT), { snapshot });
    const list = await screen.findByRole('region', { name: 'Request list' });
    expect(within(list).getByText('No request yet')).toBeInTheDocument();
    expect(screen.getAllByText('No request yet')).toHaveLength(2);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'New request' });
    await view.user.click(buttons[buttons.length - 1] as HTMLElement);
    expect(await screen.findByRole('dialog', { name: 'New request' })).toBeInTheDocument();
  });
});

describe('RequestsView header', () => {
  it('shows the state, the requester, the channel and the two times with their labels', async () => {
    await openRequest(REQUEST.deliveryTracking);
    const header = screen.getByRole('heading', { level: 1, name: 'Show where my parcel is' }).closest('header');
    expect(header).toHaveTextContent('Challenged');
    expect(header).toHaveTextContent('R-15');
    expect(header).toHaveTextContent('Requester: Riley Chen');
    expect(header).toHaveTextContent('Channel: email');
    expect(header).toHaveTextContent('Received Oct 12, 2026, 4:00 AM');
    expect(header).toHaveTextContent('Updated 5 hr. ago');
  });

  it('offers a way back to all the requests', async () => {
    await openRequest(REQUEST.deliveryTracking);
    expect(screen.getByRole('link', { name: 'All requests' })).toHaveAttribute('href', requestsPath(STOREFRONT));
  });
});

describe('RequestsView text and attachments', () => {
  it('keeps the line breaks of the request as the requester wrote them', async () => {
    const snapshot = withRequest(STOREFRONT, REQUEST.guestCheckout, (request) => ({ ...request, body: 'First line\n\nThird line' }));
    await openRequest(REQUEST.guestCheckout, { snapshot });
    const source = screen.getByRole('region', { name: 'Request' });
    expect(within(source).getByText(/First line/).textContent).toBe('First line\n\nThird line');
  });

  it('shows an image attachment as an image that opens in a new tab and another file as a link', async () => {
    await openRequest(REQUEST.guestCheckout);
    const source = screen.getByRole('region', { name: 'Request' });
    const attachments = within(source).getByRole('list', { name: 'Attachments' });
    const image = within(attachments).getByRole('img', { name: 'empty-cart-after-payment.png' });
    expect(image).toHaveAttribute('src', '/api/projects/storefront/requests/R-13/empty-cart-after-payment.png');
    const imageLink = image.closest('a');
    expect(imageLink).toHaveAttribute('href', '/api/projects/storefront/requests/R-13/empty-cart-after-payment.png');
    expect(imageLink).toHaveAttribute('target', '_blank');
    expect(imageLink).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    const file = within(attachments).getByRole('link', { name: 'support-thread.pdf' });
    expect(file).toHaveAttribute('href', '/api/projects/storefront/requests/R-13/support-thread.pdf');
    expect(file).toHaveAttribute('target', '_blank');
    expect(within(file).queryByRole('img')).not.toBeInTheDocument();
  });

  it('says that a request has no attachment', async () => {
    await openRequest(REQUEST.deliveryTracking);
    expect(within(screen.getByRole('region', { name: 'Request' })).getByText('No attachment.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Attachments' })).not.toBeInTheDocument();
  });

  it('says that a request has no text', async () => {
    const snapshot = withRequest(STOREFRONT, REQUEST.guestCheckout, (request) => ({ ...request, body: '  ' }));
    await openRequest(REQUEST.guestCheckout, { snapshot });
    expect(within(screen.getByRole('region', { name: 'Request' })).getByText('The request has no text.')).toBeInTheDocument();
  });
});

describe('RequestsView challenge report', () => {
  it('summarises the points and the verdicts the challenger gave', async () => {
    await openRequest(REQUEST.deliveryTracking);
    const report = screen.getByRole('region', { name: 'Challenge report' });
    expect(report).toHaveTextContent('4 points');
    expect(report).toHaveTextContent('The tracking status is worth building and the link is part of it.');
    const verdicts = within(report).getByRole('list', { name: 'Verdicts' });
    expect(within(verdicts).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Keep: 1', 'Adjust: 1', 'Question: 1', 'Decline: 1']);
  });

  it('says when the report was completed and links to the run of the challenger', async () => {
    await openRequest(REQUEST.deliveryTracking);
    const report = screen.getByRole('region', { name: 'Challenge report' });
    expect(report).toHaveTextContent('Completed Oct 12, 2026, 4:30 AM');
    expect(within(report).getByRole('link', { name: 'Challenger run run_e0a8d3' })).toHaveAttribute('href', '/runs/run_e0a8d3');
  });

  it('says that no challenger run is linked to a report that names none', async () => {
    const snapshot = withReport(STOREFRONT, REQUEST.deliveryTracking, (report) => ({ ...report, runId: null }));
    await openRequest(REQUEST.deliveryTracking, { snapshot });
    const report = screen.getByRole('region', { name: 'Challenge report' });
    expect(report).toHaveTextContent('No challenger run is linked to this report');
    expect(within(report).queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows each point with its verdict, its reason and what the challenger found', async () => {
    await openRequest(REQUEST.deliveryTracking);
    const items = within(screen.getByRole('region', { name: 'Challenge report' })).getByRole('list', { name: 'Points of the report' });
    expect(within(items).getAllByRole('heading', { level: 3 })).toHaveLength(4);
    const first = within(items).getByRole('heading', { level: 3, name: 'Show the carrier tracking status on the order page' }).closest('li') as HTMLElement;
    expect(first).toHaveTextContent('Keep');
    expect(first).toHaveTextContent('Support tickets about parcel location are the main driver of this request.');
    expect(within(first).getByText('Current state')).toBeInTheDocument();
    expect(within(first).getByText('Intent')).toBeInTheDocument();
    expect(within(first).getByText('Idea')).toBeInTheDocument();
    expect(within(first).getByText('Method')).toBeInTheDocument();
    expect(first).toHaveTextContent('Read the carrier tracking feed when the order page opens and show its latest event with a time.');
  });

  it('numbers the points and puts the question of a point to the requester in front', async () => {
    await openRequest(REQUEST.deliveryTracking);
    const items = within(screen.getByRole('region', { name: 'Challenge report' })).getByRole('list', { name: 'Points of the report' });
    expect(within(items).getByLabelText('Point 3')).toHaveTextContent('3');
    const third = within(items).getByRole('heading', { level: 3, name: 'Email customers when a parcel is delayed' }).closest('li') as HTMLElement;
    expect(third).toHaveTextContent('Question for the requester: Is a parcel late as soon as the carrier reports a delay');
    expect(within(items).getByRole('heading', { level: 3, name: 'Show the carrier tracking status on the order page' }).closest('li')).not.toHaveTextContent('Question for the requester');
  });

  it('lists the sources of a point with their reference, and none for a point without source', async () => {
    await openRequest(REQUEST.deliveryTracking);
    const items = within(screen.getByRole('region', { name: 'Challenge report' })).getByRole('list', { name: 'Points of the report' });
    const sources = within(items).getAllByRole('list', { name: 'Sources' });
    expect(sources).toHaveLength(3);
    expect(sources[2]).toHaveTextContent('Promised date');
    expect(sources[2]).toHaveTextContent('api/src/orders/delivery-promise.ts:15');
  });

  it('says that a point states nothing rather than leaving a blank', async () => {
    const snapshot = withReport(STOREFRONT, REQUEST.deliveryTracking, (report) => ({
      ...report,
      items: report.items.map((item, index) => (index === 0 ? { ...item, currentState: '', reason: '' } : item)),
    }));
    await openRequest(REQUEST.deliveryTracking, { snapshot });
    const items = within(screen.getByRole('region', { name: 'Challenge report' })).getByRole('list', { name: 'Points of the report' });
    const first = within(items).getByRole('heading', { level: 3, name: 'Show the carrier tracking status on the order page' }).closest('li') as HTMLElement;
    expect(within(first).getAllByText('Not stated')).toHaveLength(2);
  });

  it('says that the challenger raised no point and summarised nothing', async () => {
    const snapshot = withReport(STOREFRONT, REQUEST.deliveryTracking, (report) => ({ ...report, items: [], summary: ' ' }));
    await openRequest(REQUEST.deliveryTracking, { snapshot });
    const report = screen.getByRole('region', { name: 'Challenge report' });
    expect(within(report).getByText('The challenger raised no point.')).toBeInTheDocument();
    expect(within(report).getByText('Not stated')).toBeInTheDocument();
    expect(within(report).queryByRole('list', { name: 'Points of the report' })).not.toBeInTheDocument();
  });

  it.each([
    [REQUEST.guestCheckout, 'Not challenged yet', 'Run the challenge to have the challenger review this request before any issue is written.'],
    [REQUEST.giftWrapping, 'Challenge in progress', 'The report appears here when the challenger has finished.'],
    [REQUEST.promoExpiry, 'No challenge report', 'This request has no challenge report.'],
  ])('explains why %s has no report', async (id, title, description) => {
    await openRequest(id);
    const report = screen.getByRole('region', { name: 'Challenge report' });
    expect(within(report).getByText(title)).toBeInTheDocument();
    expect(within(report).getByText(description)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Proposed specs' })).not.toBeInTheDocument();
  });
});

describe('RequestsView reply', () => {
  it('shows the reply the challenger drafted and copies it on demand', async () => {
    const view = await openRequest(REQUEST.deliveryTracking);
    const reply = screen.getByRole('region', { name: 'Proposed reply to the requester' });
    expect(reply).toHaveTextContent('Thanks Riley. The tracking status is ready to be specified.');
    await view.user.click(within(reply).getByRole('button', { name: 'Copy the reply' }));
    expect(await navigator.clipboard.readText()).toBe(
      'Thanks Riley. The tracking status is ready to be specified. For the late-parcel email we need one answer first: does late mean any reported delay, or more than 24 hours after the promised date?',
    );
    expect(await within(reply).findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('says that the challenger wrote no reply and offers nothing to copy', async () => {
    const snapshot = withReport(STOREFRONT, REQUEST.deliveryTracking, (report) => ({ ...report, reply: '' }));
    await openRequest(REQUEST.deliveryTracking, { snapshot });
    const reply = screen.getByRole('region', { name: 'Proposed reply to the requester' });
    expect(within(reply).getByText('The challenger wrote no reply.')).toBeInTheDocument();
    expect(within(reply).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('RequestsView proposed specs', () => {
  it('shows each spec with its type, the points it comes from and its four parts', async () => {
    await openRequest(REQUEST.deliveryTracking);
    const specs = within(screen.getByRole('region', { name: 'Proposed specs' })).getByRole('list', { name: 'Proposed specs' });
    const [first, second] = within(specs).getAllByRole('article');
    expect(within(first as HTMLElement).getByRole('heading', { level: 3, name: 'Show the carrier tracking status on the order page' })).toBeInTheDocument();
    expect(first).toHaveTextContent('UI');
    expect(first).toHaveTextContent('From points 1 and 2');
    expect(first).toHaveTextContent('Customers write to support to ask where their parcel is');
    expect(within(first as HTMLElement).getAllByRole('listitem').map((item) => item.textContent)).toEqual(
      expect.arrayContaining(['The tracking number links to the carrier’s tracking page in a new tab.', 'Emails about delays', 'Rating the carrier']),
    );
    expect(first).toHaveTextContent('A browser journey on a shipped order with a recorded carrier answer');
    expect(second).toHaveTextContent('Feature');
    expect(second).toHaveTextContent('From point 3');
  });

  it('flags a spec with problems, lists them, and leaves it unticked while the others are ticked', async () => {
    await openRequest(REQUEST.deliveryTracking);
    const specs = within(screen.getByRole('region', { name: 'Proposed specs' })).getByRole('list', { name: 'Proposed specs' });
    const [first, second] = within(specs).getAllByRole('article') as HTMLElement[];
    expect(within(first as HTMLElement).queryByText('Problems to fix before creating its issue')).not.toBeInTheDocument();
    expect(within(second as HTMLElement).getByText('Problems to fix before creating its issue')).toBeInTheDocument();
    expect(within(second as HTMLElement).getByText(/The first criterion does not say what late means/)).toBeInTheDocument();
    expect(within(second as HTMLElement).getByText(/names no mailbox the tests can read/)).toBeInTheDocument();
    expect(within(first as HTMLElement).getByRole('checkbox', { name: 'Keep the spec “Show the carrier tracking status on the order page”' })).toBeChecked();
    expect(within(second as HTMLElement).getByRole('checkbox', { name: 'Keep the spec “Email customers when a parcel is late”' })).not.toBeChecked();
  });

  it('links a spec to the issue made from it and offers neither to keep nor to edit it', async () => {
    await openRequest(REQUEST.orderHistory);
    const specs = within(screen.getByRole('region', { name: 'Proposed specs' })).getByRole('list', { name: 'Proposed specs' });
    const [first] = within(specs).getAllByRole('article') as HTMLElement[];
    expect(within(first as HTMLElement).getByRole('link', { name: 'Issue #41' })).toHaveAttribute('href', `/projects/${STOREFRONT}/issues/41`);
    expect(within(specs).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(specs).queryByRole('button', { name: /Edit the spec/ })).not.toBeInTheDocument();
  });

  it('says that the challenger proposed no spec', async () => {
    await openRequest(REQUEST.loyaltyPoints);
    const specs = screen.getByRole('region', { name: 'Proposed specs' });
    expect(within(specs).getByText('No spec proposed')).toBeInTheDocument();
    expect(within(specs).getByText('The challenger proposed no spec for this request.')).toBeInTheDocument();
  });

  it('leaves out the points a spec cites that the report does not hold', async () => {
    const snapshot = withReport(STOREFRONT, REQUEST.deliveryTracking, (report) => ({
      ...report,
      specs: report.specs.map((spec, index) => (index === 0 ? { ...spec, itemIds: ['item-9'] } : spec)),
    }));
    await openRequest(REQUEST.deliveryTracking, { snapshot });
    const [first] = within(screen.getByRole('list', { name: 'Proposed specs' })).getAllByRole('article');
    expect(first).not.toHaveTextContent('From point');
  });
});

describe('RequestsView created issues', () => {
  it('links the issues made from the request, with their state', async () => {
    await openRequest(REQUEST.orderHistory);
    const issues = within(screen.getByRole('region', { name: 'Created issues' })).getByRole('list', { name: 'Issues created from this request' });
    const first = within(issues).getByRole('link', { name: /Paginate the order history endpoint/ });
    expect(first).toHaveAttribute('href', `/projects/${STOREFRONT}/issues/41`);
    expect(first).toHaveTextContent('Merged');
    expect(within(issues).getByRole('link', { name: /Filter the order history by status/ })).toHaveAttribute('href', `/projects/${STOREFRONT}/issues/45`);
    expect(within(issues).getByRole('link', { name: /Filter the order history by status/ })).toHaveTextContent('Implementing');
  });

  it('names an issue the project does not hold without linking it', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT, (project) => ({ ...project, issues: project.issues.filter((issue) => issue.number !== 41) }));
    await openRequest(REQUEST.orderHistory, { snapshot });
    const issues = screen.getByRole('list', { name: 'Issues created from this request' });
    expect(within(issues).getAllByRole('link')).toHaveLength(1);
    expect(issues).toHaveTextContent('#41');
    expect(issues).toHaveTextContent('Not among the issues of this project');
  });

  it('shows no created issues section for a request that made none', async () => {
    await openRequest(REQUEST.deliveryTracking);
    expect(screen.queryByRole('region', { name: 'Created issues' })).not.toBeInTheDocument();
  });
});

describe('RequestsView notices', () => {
  it('says when and why the last challenge failed', async () => {
    await openRequest(REQUEST.returnsLabels);
    const failure = screen.getByRole('region', { name: 'The last challenge failed' });
    expect(failure).toHaveTextContent('the model API answered "overloaded" twice in a row');
    expect(failure).toHaveTextContent('Failed 41 min. ago');
  });

  it('says that a failure left no reason', async () => {
    const snapshot = withRequest(STOREFRONT, REQUEST.returnsLabels, (request) => ({ ...request, lastChallengeFailure: request.lastChallengeFailure === null ? null : { ...request.lastChallengeFailure, reason: '' } }));
    await openRequest(REQUEST.returnsLabels, { snapshot });
    expect(screen.getByRole('region', { name: 'The last challenge failed' })).toHaveTextContent('No reason was recorded.');
  });

  it('shows the reason a request was declined', async () => {
    await openRequest(REQUEST.loyaltyPoints);
    expect(screen.getByRole('region', { name: 'Request declined' })).toHaveTextContent('Out of scope for the web shop');
  });

  it('says that a declined request recorded no reason', async () => {
    const snapshot = withRequest(STOREFRONT, REQUEST.loyaltyPoints, (request) => ({ ...request, declineReason: null }));
    await openRequest(REQUEST.loyaltyPoints, { snapshot });
    expect(screen.getByRole('region', { name: 'Request declined' })).toHaveTextContent('No reason was recorded.');
  });

  it('shows no failure and no decline notice for an ordinary request', async () => {
    await openRequest(REQUEST.deliveryTracking);
    expect(screen.queryByRole('region', { name: 'The last challenge failed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Request declined' })).not.toBeInTheDocument();
  });

  it('links to the live run of the challenge of this request, with its last line', async () => {
    const run = runAt(TEST_NOW, 'run_challenge_14', { role: 'challenger', project: STOREFRONT, subject: { kind: 'request', id: REQUEST.giftWrapping }, lastLine: 'Reading the checkout page', branch: null });
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => [...runs, run]);
    await openRequest(REQUEST.giftWrapping, { snapshot });
    const notice = screen.getByRole('link', { name: /The challenger is reviewing this request/ });
    expect(notice).toHaveAttribute('href', '/runs/run_challenge_14');
    expect(notice).toHaveTextContent('Reading the checkout page');
    expect(notice).toHaveTextContent('Follow run run_challenge_14');
  });

  it('says that the live run has not written anything yet', async () => {
    const run = runAt(TEST_NOW, 'run_challenge_14', { role: 'challenger', project: STOREFRONT, subject: { kind: 'request', id: REQUEST.giftWrapping }, lastLine: null, branch: null });
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => [...runs, run]);
    await openRequest(REQUEST.giftWrapping, { snapshot });
    expect(screen.getByRole('link', { name: /The challenger is reviewing this request/ })).toHaveTextContent('The run has not written anything yet.');
  });

  it('ignores a live run on the request of another project that has the same identifier', async () => {
    const run = runAt(TEST_NOW, 'run_challenge_other', { role: 'challenger', project: LEDGER, subject: { kind: 'request', id: REQUEST.giftWrapping }, branch: null });
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => [...runs, run]);
    await openRequest(REQUEST.giftWrapping, { snapshot });
    expect(screen.queryByRole('link', { name: /The challenger is reviewing this request/ })).not.toBeInTheDocument();
  });

  it('ignores a run that has ended', async () => {
    const run = runAt(TEST_NOW, 'run_challenge_done', { role: 'challenger', project: STOREFRONT, subject: { kind: 'request', id: REQUEST.giftWrapping }, status: 'succeeded', outcome: 'success', branch: null });
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => [...runs, run]);
    await openRequest(REQUEST.giftWrapping, { snapshot });
    expect(screen.queryByRole('link', { name: /The challenger is reviewing this request/ })).not.toBeInTheDocument();
  });
});

describe('RequestsView new request', () => {
  it('records a request for the project of the address from the button of the list', async () => {
    const view = await renderRoute(requestsPath(STOREFRONT));
    await view.user.click(await screen.findByRole('button', { name: 'New request' }));
    const dialog = await screen.findByRole('dialog', { name: 'New request' });
    await view.user.type(within(dialog).getByLabelText('Title'), 'Offline wishlist');
    await view.user.type(within(dialog).getByLabelText('Request text'), 'Let customers browse their wishlist without a connection.');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the request' }));
    await waitFor(() =>
      expect(view.transport.commands).toEqual([
        { name: 'request.create', body: { project: STOREFRONT, title: 'Offline wishlist', requester: 'Alex Morgan', body: 'Let customers browse their wishlist without a connection.', attachments: [] } },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('refuses a request without a title or a text, and says what is missing', async () => {
    const view = await renderRoute(requestsPath(STOREFRONT));
    await view.user.click(await screen.findByRole('button', { name: 'New request' }));
    const dialog = await screen.findByRole('dialog', { name: 'New request' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the request' }));
    expect(within(dialog).getByText('Give the request a short title.')).toBeInTheDocument();
    expect(within(dialog).getByText('Paste the text of the request.')).toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('shows what the factory did once it recorded the request', async () => {
    const view = await renderRoute(requestsPath(STOREFRONT));
    view.transport.effects.set('request.create', 'Request R-19 received for storefront with 0 attachment(s)');
    await view.user.click(await screen.findByRole('button', { name: 'New request' }));
    const dialog = await screen.findByRole('dialog', { name: 'New request' });
    await view.user.type(within(dialog).getByLabelText('Title'), 'Offline wishlist');
    await view.user.type(within(dialog).getByLabelText('Request text'), 'Browse the wishlist offline.');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the request' }));
    expect(await within(screen.getByRole('status')).findByText('Request R-19 received for storefront with 0 attachment(s)')).toBeInTheDocument();
  });

  it('keeps the dialog open and shows the refusal of the factory', async () => {
    const view = await renderRoute(requestsPath(STOREFRONT));
    view.transport.commandFailure = 'the requests folder is not writable';
    await view.user.click(await screen.findByRole('button', { name: 'New request' }));
    const dialog = await screen.findByRole('dialog', { name: 'New request' });
    await view.user.type(within(dialog).getByLabelText('Title'), 'Offline wishlist');
    await view.user.type(within(dialog).getByLabelText('Request text'), 'Browse the wishlist offline.');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the request' }));
    expect(await within(screen.getByRole('alert')).findByText('the requests folder is not writable')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New request' })).toBeInTheDocument();
  });

  it('disables the save button while the command is in flight', async () => {
    const view = await renderRoute(requestsPath(STOREFRONT));
    await view.user.click(await screen.findByRole('button', { name: 'New request' }));
    const dialog = await screen.findByRole('dialog', { name: 'New request' });
    await view.user.type(within(dialog).getByLabelText('Title'), 'Offline wishlist');
    await view.user.type(within(dialog).getByLabelText('Request text'), 'Browse the wishlist offline.');
    const release = view.transport.holdCommands();
    const save = within(dialog).getByRole('button', { name: 'Save the request' });
    await view.user.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('does not ask which project the request is for', async () => {
    const view = await renderRoute(requestsPath(STOREFRONT));
    await view.user.click(await screen.findByRole('button', { name: 'New request' }));
    const dialog = await screen.findByRole('dialog', { name: 'New request' });
    expect(within(dialog).queryByLabelText('Project')).not.toBeInTheDocument();
  });

  it('opens the dialog when the address asks for it, then drops the request from the address', async () => {
    const view = await renderRoute(`${requestsPath(STOREFRONT)}?new=1`);
    expect(await screen.findByRole('dialog', { name: 'New request' })).toBeInTheDocument();
    await view.expectLocation(requestsPath(STOREFRONT));
  });

  it('keeps the other parts of the address when it drops the request for a new one', async () => {
    const view = await renderRoute(`${requestsPath(STOREFRONT)}?new=1&highlight=R-15`);
    await screen.findByRole('dialog', { name: 'New request' });
    await view.expectLocation(`${requestsPath(STOREFRONT)}?highlight=R-15`);
  });

  it('records the request for the other project when the address is that project', async () => {
    const view = await renderRoute(`${requestsPath(LEDGER)}?new=1`);
    const dialog = await screen.findByRole('dialog', { name: 'New request' });
    await view.user.type(within(dialog).getByLabelText('Title'), 'Dunning letters');
    await view.user.type(within(dialog).getByLabelText('Request text'), 'Send a reminder when an invoice is late.');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save the request' }));
    await waitFor(() => expect(view.transport.commands).toHaveLength(1));
    expect(view.transport.commands[0]).toEqual({
      name: 'request.create',
      body: { project: LEDGER, title: 'Dunning letters', requester: 'Alex Morgan', body: 'Send a reminder when an invoice is late.', attachments: [] },
    });
  });

  it('does not open the dialog without the request in the address', async () => {
    await renderRoute(requestsPath(STOREFRONT));
    await screen.findByRole('region', { name: 'Request list' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('RequestsView in French', () => {
  it('words the list, the report and the specs in French', async () => {
    await openRequest(REQUEST.deliveryTracking, { locale: 'fr' });
    expect(screen.getByRole('region', { name: 'Vous concernent' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'En cours' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Fermées' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Vous concernent' })).getByRole('link', { name: /Show where my parcel is/ })).toHaveTextContent('Challengée · 4 points');
    const report = screen.getByRole('region', { name: 'Rapport de challenge' });
    expect(within(report).getByRole('list', { name: 'Points du rapport' })).toBeInTheDocument();
    expect(within(report).getByRole('list', { name: 'Verdicts' })).toHaveTextContent('Conserver : 1');
    expect(screen.getByRole('region', { name: 'Réponse proposée au demandeur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copier la réponse' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Décliner' })).toBeInTheDocument();
  });

  it('uses the singular and the plural of the specs and the points', async () => {
    await openRequest(REQUEST.deliveryTracking, { locale: 'fr' });
    const [first, second] = within(screen.getByRole('list', { name: 'Specs proposées' })).getAllByRole('article');
    expect(first).toHaveTextContent('Tirée des points 1 et 2');
    expect(second).toHaveTextContent('Tirée du point 3');
    expect(screen.getByRole('button', { name: 'Créer les issues' })).toBeInTheDocument();
    expect(screen.getByText('1 sur 2 retenues')).toBeInTheDocument();
  });

  it('words the times and the labels of the header in French', async () => {
    await openRequest(REQUEST.deliveryTracking, { locale: 'fr' });
    const header = screen.getByRole('heading', { level: 1, name: 'Show where my parcel is' }).closest('header');
    expect(header).toHaveTextContent('Demandeur : Riley Chen');
    expect(header).toHaveTextContent('Reçue le 12 oct. 2026');
    expect(header).toHaveTextContent('Mise à jour il y a 5 h');
  });
});
