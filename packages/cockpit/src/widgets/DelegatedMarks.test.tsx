import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { openIssue, withIssue } from '../views/issues/issue-test-support.ts';
import { openPullRequest } from '../views/pull-requests/pull-request-test-support.ts';
import { fixtureSnapshot } from '../test/render.tsx';
import { ISSUE, PULL_REQUEST } from '../test/fixtures/storefront/ids.ts';

const marks = () => screen.getByRole('region', { name: 'Decided without you' });

describe('the marks of the gestures the delegate made', () => {
  it('show on the page of a pull request the gesture made on it, with its reason', async () => {
    await openPullRequest(PULL_REQUEST.localSetupDocs);
    const region = marks();
    expect(within(region).getByText('Pull request merged')).toBeInTheDocument();
    expect(within(region).getByText('Reason: A documentation change: every criterion is proven, the review is clean and only docs/ changed.')).toBeInTheDocument();
    expect(within(region).getByText('The gestures orchestrator made on this item.')).toBeInTheDocument();
  });

  it('show on the page of an issue every gesture made on it or on its pull request', async () => {
    await openIssue(ISSUE.localSetupDocs);
    expect(within(marks()).getByText('Pull request merged')).toBeInTheDocument();
    expect(within(marks()).getAllByText('by orchestrator')).toHaveLength(1);
  });

  it('leave a page without them when the delegate made no gesture on it', async () => {
    await openIssue(ISSUE.promoRounding);
    expect(screen.queryByRole('region', { name: 'Decided without you' })).not.toBeInTheDocument();
    await openPullRequest(PULL_REQUEST.checkoutScreenReader);
    expect(screen.queryByRole('region', { name: 'Decided without you' })).not.toBeInTheDocument();
  });

  it('list several gestures of one issue, newest first', async () => {
    const snapshot = withIssue('storefront', ISSUE.localSetupDocs, (issue) => ({
      ...issue,
      delegated: [
        { at: '2026-10-12T10:00:00.000Z', actor: 'orchestrator', gesture: 'merge', target: { kind: 'pull-request', number: 14 }, issueNumber: issue.number, reason: 'documentation only', rule: 'autonomy.merge for docs' },
        { at: '2026-10-12T08:00:00.000Z', actor: 'orchestrator', gesture: 'validate-spec', target: { kind: 'issue', number: issue.number }, issueNumber: issue.number, reason: 'the spec is complete', rule: 'autonomy.validateSpecs' },
      ],
    }), fixtureSnapshot());
    await openIssue(ISSUE.localSetupDocs, { snapshot });
    const items = within(within(marks()).getByRole('list', { name: 'Delegated decisions' })).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.delegated-decision__gesture')?.textContent)).toEqual(['Pull request merged', 'Spec validated']);
  });
});
