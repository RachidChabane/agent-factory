import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand, expectCommand } from '../../test/commands.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { PULL_REQUEST as LEDGER_PULL_REQUEST } from '../../test/fixtures/ledger/ids.ts';
import { PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { fixtureSnapshot } from '../../test/render.tsx';
import { LEDGER, openPullRequest, STOREFRONT } from './pull-request-test-support.ts';

const CHECKOUT = PULL_REQUEST.checkoutScreenReader;
const OPERATOR = 'Alex Morgan';
const FEEDBACK = 'The summary must also be announced when the form is submitted twice.';

const feedbackRegion = () => screen.getByRole('region', { name: 'External feedback' });
const submitButton = () => screen.getByRole('button', { name: 'Send the feedback' });
const authorField = () => screen.getByLabelText('Author of the feedback');
const bodyField = () => screen.getByLabelText('Feedback');

describe('PullRequestsView external feedback', () => {
  it('lists what was said about the pull request, who said it, where and when', async () => {
    await openPullRequest(PULL_REQUEST.orderHistoryPagination);
    const list = within(feedbackRegion()).getByRole('list', { name: 'External feedback received' });
    const entries = within(list).getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(within(entries[0] as HTMLElement).getByText('jlee')).toBeInTheDocument();
    expect(within(entries[0] as HTMLElement).getByText('github-review-comment')).toBeInTheDocument();
    expect(within(entries[0] as HTMLElement).getByText(/A limit of 0 returns an empty page/)).toBeInTheDocument();
    expect(within(entries[0] as HTMLElement).getByText(/ago$/)).toHaveAttribute('datetime', '2026-10-12T08:52:00.000Z');
    expect(within(entries[1] as HTMLElement).getByText('dreyes')).toBeInTheDocument();
  });

  it('says whether a piece of feedback started a new cycle', async () => {
    await openPullRequest(PULL_REQUEST.orderHistoryPagination);
    const entries = within(within(feedbackRegion()).getByRole('list', { name: 'External feedback received' })).getAllByRole('listitem');
    expect(within(entries[0] as HTMLElement).getByText('Started a new cycle')).toBeInTheDocument();
    expect(within(entries[0] as HTMLElement).queryByText('No new cycle started')).not.toBeInTheDocument();
    expect(within(entries[1] as HTMLElement).getByText('No new cycle started')).toBeInTheDocument();
  });

  it('says that there is no feedback rather than leaving the section empty', async () => {
    await openPullRequest(CHECKOUT);
    expect(within(feedbackRegion()).getByText('No external feedback on this pull request.')).toBeInTheDocument();
    expect(within(feedbackRegion()).queryByRole('list', { name: 'External feedback received' })).not.toBeInTheDocument();
  });
});

describe('PullRequestsView feedback form', () => {
  it('offers the form on an open pull request whose issue awaits the review, with the operator as the author', async () => {
    await openPullRequest(CHECKOUT);
    expect(within(feedbackRegion()).getByRole('form', { name: 'Send feedback' })).toBeInTheDocument();
    expect(authorField()).toHaveValue(OPERATOR);
    expect(bodyField()).toHaveValue('');
    expect(submitButton()).toBeEnabled();
  });

  it('also offers it while the checks run', async () => {
    await openPullRequest(PULL_REQUEST.expiredPromoMessage);
    expect(screen.getByRole('form', { name: 'Send feedback' })).toBeInTheDocument();
  });

  it('sends the feedback with the operator as its author', async () => {
    const view = await openPullRequest(CHECKOUT);
    await view.user.type(bodyField(), FEEDBACK);
    await clickAndExpectCommand(view.user, submitButton(), view.transport, 'pr.feedback', { project: STOREFRONT, number: CHECKOUT, author: OPERATOR, body: FEEDBACK });
  });

  it('sends the feedback under the name of the person who gave it', async () => {
    const view = await openPullRequest(CHECKOUT);
    await view.user.clear(authorField());
    await view.user.type(authorField(), '  Dana Reyes ');
    await view.user.type(bodyField(), `  ${FEEDBACK}  `);
    await view.user.click(submitButton());
    await expectCommand(view.transport, 'pr.feedback', { project: STOREFRONT, number: CHECKOUT, author: 'Dana Reyes', body: FEEDBACK });
  });

  it('sends the feedback when the operator presses Enter in the author field', async () => {
    const view = await openPullRequest(CHECKOUT);
    await view.user.type(bodyField(), FEEDBACK);
    await view.user.type(authorField(), '{Enter}');
    await expectCommand(view.transport, 'pr.feedback', { project: STOREFRONT, number: CHECKOUT, author: OPERATOR, body: FEEDBACK });
  });

  it('asks for the feedback before sending anything', async () => {
    const view = await openPullRequest(CHECKOUT);
    expect(screen.queryByText('Paste the feedback to send.')).not.toBeInTheDocument();
    await view.user.click(submitButton());
    expect(screen.getByText('Paste the feedback to send.')).toBeInTheDocument();
    expect(bodyField()).toHaveAccessibleDescription('Paste the feedback to send.');
    expect(view.transport.commands).toEqual([]);
  });

  it('asks who gave the feedback when the author is blank, and sends nothing', async () => {
    const view = await openPullRequest(CHECKOUT);
    await view.user.clear(authorField());
    await view.user.type(bodyField(), FEEDBACK);
    await view.user.click(submitButton());
    expect(screen.getByText('Say who gave this feedback.')).toBeInTheDocument();
    expect(screen.queryByText('Paste the feedback to send.')).not.toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('treats a feedback made of blanks as missing', async () => {
    const view = await openPullRequest(CHECKOUT);
    await view.user.type(bodyField(), '   ');
    await view.user.click(submitButton());
    expect(screen.getByText('Paste the feedback to send.')).toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('shows what the factory did and empties the feedback once it is accepted, keeping the author', async () => {
    const view = await openPullRequest(CHECKOUT);
    view.transport.effects.set('pr.feedback', 'Feedback recorded; issue #55 starts attempt 4');
    await view.user.clear(authorField());
    await view.user.type(authorField(), 'Dana Reyes');
    await view.user.type(bodyField(), FEEDBACK);
    await view.user.click(submitButton());
    expect(await within(screen.getByRole('status')).findByText('Feedback recorded; issue #55 starts attempt 4')).toBeInTheDocument();
    await waitFor(() => expect(bodyField()).toHaveValue(''));
    expect(authorField()).toHaveValue('Dana Reyes');
    expect(screen.queryByText('Paste the feedback to send.')).not.toBeInTheDocument();
  });

  it('keeps what was typed and shows the reason when the factory refuses the feedback', async () => {
    const view = await openPullRequest(CHECKOUT);
    view.transport.commandFailure = 'Feedback on pull request #60 cannot start a new cycle: issue #55 is gating, not awaiting review';
    await view.user.type(bodyField(), FEEDBACK);
    await view.user.click(submitButton());
    expect(await within(screen.getByRole('alert')).findByText(/cannot start a new cycle: issue #55 is gating/)).toBeInTheDocument();
    expect(bodyField()).toHaveValue(FEEDBACK);
  });

  it('is disabled while the feedback is in flight, and sends it only once', async () => {
    const view = await openPullRequest(CHECKOUT);
    const release = view.transport.holdCommands();
    await view.user.type(bodyField(), FEEDBACK);
    await view.user.click(submitButton());
    await waitFor(() => expect(submitButton()).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(submitButton()).toBeEnabled());
    expect(view.transport.commands).toHaveLength(1);
  });

  it('sends feedback on a pull request of the ledger to the ledger', async () => {
    const view = await openPullRequest(LEDGER_PULL_REQUEST.webhookSignatures, {}, LEDGER);
    await view.user.type(bodyField(), FEEDBACK);
    await clickAndExpectCommand(view.user, submitButton(), view.transport, 'pr.feedback', { project: LEDGER, number: LEDGER_PULL_REQUEST.webhookSignatures, author: OPERATOR, body: FEEDBACK });
  });
});

describe('PullRequestsView feedback that cannot be taken', () => {
  it('explains why a pull request whose issue is ready to merge takes no feedback, and offers no form', async () => {
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch);
    expect(screen.queryByRole('form', { name: 'Send feedback' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send the feedback' })).not.toBeInTheDocument();
    expect(within(feedbackRegion()).getByText('Issue #52 is currently “Ready to merge”. Feedback starts an implementation cycle only while the pull request awaits review, so it cannot be sent at this stage.')).toBeInTheDocument();
  });

  it('offers no form on a merged pull request and says that it takes no more feedback', async () => {
    await openPullRequest(PULL_REQUEST.orderHistoryPagination);
    expect(screen.queryByRole('form', { name: 'Send feedback' })).not.toBeInTheDocument();
    expect(within(feedbackRegion()).getByText('This pull request is merged: it takes no more feedback.')).toBeInTheDocument();
  });

  it('offers no form on a closed pull request and says that it takes no more feedback', async () => {
    await openPullRequest(PULL_REQUEST.legacyDateHelpers);
    expect(screen.queryByRole('form', { name: 'Send feedback' })).not.toBeInTheDocument();
    expect(within(feedbackRegion()).getByText('This pull request is closed: it takes no more feedback.')).toBeInTheDocument();
  });

  it('leaves the decision to the factory when the issue of the pull request is not in the snapshot', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT, (project) => ({ ...project, issues: project.issues.filter((issue) => issue.number !== 52) }));
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch, { snapshot });
    expect(screen.getByRole('form', { name: 'Send feedback' })).toBeInTheDocument();
  });

  it('judges the state of the issue of this project, not of the issue of another project that shares its number', async () => {
    await openPullRequest(LEDGER_PULL_REQUEST.webhookSignatures, {}, LEDGER);
    expect(screen.getByRole('form', { name: 'Send feedback' })).toBeInTheDocument();
  });
});

describe('PullRequestsView feedback in French', () => {
  it('words the form and its errors in French', async () => {
    const view = await openPullRequest(CHECKOUT, { locale: 'fr' });
    const section = screen.getByRole('region', { name: 'Retours externes' });
    expect(within(section).getByRole('form', { name: 'Envoyer un retour' })).toBeInTheDocument();
    await view.user.click(within(section).getByRole('button', { name: 'Envoyer le retour' }));
    expect(within(section).getByText('Collez le retour à envoyer.')).toBeInTheDocument();
    await view.user.type(within(section).getByLabelText('Retour'), FEEDBACK);
    await view.user.click(within(section).getByRole('button', { name: 'Envoyer le retour' }));
    await expectCommand(view.transport, 'pr.feedback', { project: STOREFRONT, number: CHECKOUT, author: OPERATOR, body: FEEDBACK });
  });

  it('explains in French why feedback is not taken', async () => {
    await openPullRequest(PULL_REQUEST.naturalLanguageSearch, { locale: 'fr' });
    expect(screen.getByText(/L’issue n° 52 est actuellement « Prête à merger »/)).toBeInTheDocument();
  });

  it('says in French that a merged pull request takes no more feedback', async () => {
    await openPullRequest(PULL_REQUEST.orderHistoryPagination, { locale: 'fr' });
    expect(screen.getByText('Cette pull request est mergée : elle n’accepte plus de retours.')).toBeInTheDocument();
    expect(screen.getByText('Nouveau cycle lancé')).toBeInTheDocument();
  });
});
