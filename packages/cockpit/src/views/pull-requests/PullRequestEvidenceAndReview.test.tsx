import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReviewRound } from '../../contract/index.ts';
import { PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { openPullRequest, STOREFRONT, withPullRequest } from './pull-request-test-support.ts';

const SEARCH = PULL_REQUEST.naturalLanguageSearch;
const evidence = () => screen.getByRole('region', { name: 'Evidence' });
const review = () => screen.getByRole('region', { name: 'Review' });
const roundOf = (title: string) => within(review()).getByText(title).closest('li') as HTMLElement;

describe('PullRequestsView evidence', () => {
  it('shows the evidence of a pull request and says that it is complete', async () => {
    await openPullRequest(SEARCH);
    expect(within(evidence()).getByText('Evidence complete')).toBeInTheDocument();
    expect(within(evidence()).getByText('What the pull request demonstrates, before the code.')).toBeInTheDocument();
    expect(within(evidence()).queryByRole('region', { name: 'Missing evidence' })).not.toBeInTheDocument();
    for (const title of ['Search results for "blue sneakers under 60"', 'Searching with a sentence', 'Unit tests of the price phrases and the chips', 'Acceptance tests by criterion', 'Query understanding', 'Summary of the change']) {
      expect(within(evidence()).getByRole('figure', { name: title })).toBeInTheDocument();
    }
  });

  it('says that the evidence is incomplete and lists what is missing', async () => {
    await openPullRequest(PULL_REQUEST.checkoutScreenReader);
    expect(within(evidence()).getByText('Evidence incomplete')).toBeInTheDocument();
    const missing = within(evidence()).getByRole('region', { name: 'Missing evidence' });
    expect(within(missing).getByText('recording of the keyboard-only checkout journey')).toBeInTheDocument();
    expect(within(evidence()).getByRole('figure', { name: 'The address form after a failed submit' })).toBeInTheDocument();
  });

  it('reports the evidence a merged pull request went without', async () => {
    await openPullRequest(PULL_REQUEST.deliveryBanner);
    expect(within(evidence()).getByText('Evidence incomplete')).toBeInTheDocument();
    expect(within(within(evidence()).getByRole('region', { name: 'Missing evidence' })).getByText('screenshot of the product page without a delivery estimate')).toBeInTheDocument();
  });

  it('says that no evidence is attached rather than leaving the section empty', async () => {
    const snapshot = withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, evidence: [], evidenceComplete: false, missingEvidence: [] }));
    await openPullRequest(SEARCH, { snapshot });
    expect(within(evidence()).getByText('No evidence is attached to this pull request')).toBeInTheDocument();
    expect(within(evidence()).getByText('Evidence incomplete')).toBeInTheDocument();
    expect(within(evidence()).queryByRole('group', { name: 'Evidence of the pull request' })).not.toBeInTheDocument();
  });

  it('words the evidence section in French', async () => {
    await openPullRequest(PULL_REQUEST.checkoutScreenReader, { locale: 'fr' });
    const section = screen.getByRole('region', { name: 'Preuves' });
    expect(within(section).getByText('Preuves incomplètes')).toBeInTheDocument();
    expect(within(within(section).getByRole('region', { name: 'Preuves manquantes' })).getByText('recording of the keyboard-only checkout journey')).toBeInTheDocument();
  });
});

describe('PullRequestsView review rounds', () => {
  it('lists the rounds of the review, the latest first', async () => {
    await openPullRequest(SEARCH);
    const rounds = within(review()).getByRole('list', { name: 'Review rounds' });
    expect(within(rounds).getAllByText(/^Round \d$/).map((title) => title.textContent)).toEqual(['Round 2', 'Round 1']);
  });

  it('links a round to the review run, and says when it completed', async () => {
    await openPullRequest(SEARCH);
    const link = within(roundOf('Round 2')).getByRole('link', { name: 'Open the review run run_a9d3c6' });
    expect(link).toHaveAttribute('href', '/runs/run_a9d3c6');
    expect(within(roundOf('Round 2')).getByText(/ago$/)).toHaveAttribute('datetime', '2026-10-09T11:53:00.000Z');
    expect(within(roundOf('Round 1')).getByRole('link', { name: 'Open the review run run_14ad92' })).toHaveAttribute('href', '/runs/run_14ad92');
  });

  it('shows a finding with its severity, its category, its place and whether it is resolved', async () => {
    await openPullRequest(SEARCH);
    const findings = within(roundOf('Round 2')).getByRole('list', { name: 'Findings of round 2' });
    expect(within(findings).getByText('Non-blocking')).toBeInTheDocument();
    expect(within(findings).getByText('Repository rules')).toBeInTheDocument();
    expect(within(findings).getByText('Unresolved')).toBeInTheDocument();
    expect(within(findings).getByText('web/src/search/filters.ts:30')).toBeInTheDocument();
    expect(within(findings).getByText(/A code comment explains the unit conversion/)).toBeInTheDocument();
  });

  it('tells a resolved finding from an unresolved one', async () => {
    await openPullRequest(SEARCH);
    const findings = within(roundOf('Round 1')).getByRole('list', { name: 'Findings of round 1' });
    expect(within(findings).getAllByText('Resolved')).toHaveLength(2);
    expect(within(findings).getByText('Blocking')).toBeInTheDocument();
    expect(within(findings).getByText('Correctness')).toBeInTheDocument();
    expect(within(findings).getByText('Scope creep')).toBeInTheDocument();
  });

  it('gives a file without a line as the file alone', async () => {
    await openPullRequest(SEARCH);
    const findings = within(roundOf('Round 1')).getByRole('list', { name: 'Findings of round 1' });
    expect(within(findings).getByText('web/src/search/analytics.ts')).toBeInTheDocument();
    expect(within(findings).getByText('web/src/search/price-bound.ts:9')).toBeInTheDocument();
  });

  it('counts the findings of a round and the ones left unresolved', async () => {
    await openPullRequest(SEARCH);
    expect(within(roundOf('Round 2')).getByText('1 finding')).toBeInTheDocument();
    expect(within(roundOf('Round 2')).getByText('1 unresolved')).toBeInTheDocument();
    expect(within(roundOf('Round 1')).getByText('2 findings')).toBeInTheDocument();
    expect(within(roundOf('Round 1')).queryByText(/unresolved$/)).not.toBeInTheDocument();
  });

  it('says that a round found nothing', async () => {
    await openPullRequest(PULL_REQUEST.expiredPromoMessage);
    expect(within(roundOf('Round 1')).getByText('No finding')).toBeInTheDocument();
    expect(within(roundOf('Round 1')).queryByRole('list', { name: 'Findings of round 1' })).not.toBeInTheDocument();
  });

  it('says that a finding is not tied to a file when it names none', async () => {
    const snapshot = withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({
      ...pullRequest,
      reviewRounds: pullRequest.reviewRounds.map((round: ReviewRound) => ({ ...round, findings: round.findings.map((finding) => ({ ...finding, file: null, line: null })) })),
    }));
    await openPullRequest(SEARCH, { snapshot });
    expect(within(roundOf('Round 2')).getByText('Not tied to a file')).toBeInTheDocument();
  });

  it('says that no review is recorded rather than leaving the section empty', async () => {
    const snapshot = withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, reviewRounds: [] }));
    await openPullRequest(SEARCH, { snapshot });
    expect(within(review()).getByText('No review recorded')).toBeInTheDocument();
    expect(within(review()).queryByRole('list', { name: 'Review rounds' })).not.toBeInTheDocument();
  });

  it('shows a round whose run is unknown without a dead link', async () => {
    const snapshot = withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, reviewRounds: pullRequest.reviewRounds.map((round) => ({ ...round, runId: '' })) }));
    await openPullRequest(SEARCH, { snapshot });
    expect(within(review()).queryByRole('link')).not.toBeInTheDocument();
    expect(within(review()).getAllByText(/^Round \d$/)).toHaveLength(2);
  });

  it('shows the review of a closed pull request with the finding that was never resolved', async () => {
    await openPullRequest(PULL_REQUEST.legacyDateHelpers);
    const finding = within(review()).getByRole('list', { name: 'Findings of round 1' });
    expect(within(finding).getByText('Blocking')).toBeInTheDocument();
    expect(within(finding).getByText('Unresolved')).toBeInTheDocument();
  });

  it('words the review in French, with the plural of a count of one', async () => {
    await openPullRequest(SEARCH, { locale: 'fr' });
    const section = screen.getByRole('region', { name: 'Revue' });
    expect(within(section).getByText('Constats du relecteur, passe par passe.')).toBeInTheDocument();
    expect(within(section).getByText('Passe 2')).toBeInTheDocument();
    expect(within(section).getByText('1 constat')).toBeInTheDocument();
    expect(within(section).getByText('2 constats')).toBeInTheDocument();
    expect(within(section).getAllByText('Non bloquant')).toHaveLength(2);
    expect(within(section).getByText('Bloquant')).toBeInTheDocument();
    expect(within(section).getByText('Règles du dépôt')).toBeInTheDocument();
    expect(within(section).getByText('Non résolu')).toBeInTheDocument();
    expect(within(section).getAllByText('Résolu')).toHaveLength(2);
  });
});
