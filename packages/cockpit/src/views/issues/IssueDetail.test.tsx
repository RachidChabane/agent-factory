import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AcceptanceCheck, Attempt } from '../../contract/index.ts';
import { mapRuns } from '../../test/fixtures/mutate.ts';
import { ISSUE as LEDGER_ISSUE } from '../../test/fixtures/ledger/ids.ts';
import { ISSUE, RUN } from '../../test/fixtures/storefront/ids.ts';
import { runAt } from '../../test/minimal-snapshot.ts';
import { fixtureSnapshot, TEST_NOW } from '../../test/render.tsx';
import { headerOf, LEDGER, openIssue, STOREFRONT, withIssue } from './issue-test-support.ts';

const TITLE_49 = 'Show the savings of a promo code in the cart summary';
const region = (name: string): HTMLElement => screen.getByRole('region', { name });

function checkOf(overrides: Partial<AcceptanceCheck> = {}): AcceptanceCheck {
  return {
    path: 'e2e/orders/example.spec.ts',
    runner: 'playwright',
    sha256: 'f'.repeat(64),
    onBase: 'fails',
    before: { result: 'failed', detail: '', score: null, screenshotUrl: null },
    ...overrides,
  };
}

function attemptOf(overrides: Partial<Attempt> = {}): Attempt {
  return {
    index: 0,
    kind: 'session',
    runId: 'run_example',
    model: 'claude-sonnet-5-5',
    effort: 'medium',
    startedAt: '2026-10-12T08:00:00.000Z',
    endedAt: '2026-10-12T08:30:00.000Z',
    outcome: 'passed',
    summary: 'The change passed the gate.',
    ...overrides,
  };
}

describe('IssueDetail header', () => {
  it('shows the number, the title, the type, the state and the branch', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const header = headerOf(TITLE_49);
    expect(header).toHaveTextContent('Needs a human');
    expect(header).toHaveTextContent('UI');
    expect(header).toHaveTextContent('#49');
    expect(header).toHaveTextContent('factory/49-promo-savings-summary');
    expect(header).toHaveTextContent('Updated 21 min. ago');
  });

  it('links the issue on the forge in a new tab', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const link = within(headerOf(TITLE_49)).getByRole('link', { name: 'Open on the forge' });
    expect(link).toHaveAttribute('href', 'https://github.example.com/example-org/storefront/issues/49');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('links the issue of a local forge to the address the factory serves it at', async () => {
    await openIssue(LEDGER_ISSUE.invoiceCsvExport, {}, LEDGER);
    const link = within(headerOf('Export invoices as CSV')).getByRole('link', { name: 'Open on the forge' });
    expect(link).toHaveAttribute('href', `/api/projects/${LEDGER}/forge/issues/27.md`);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('says that there is no forge link rather than showing a dead one', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.promoSavingsSummary, (issue) => ({ ...issue, url: '' }));
    await openIssue(ISSUE.promoSavingsSummary, { snapshot });
    const header = headerOf(TITLE_49);
    expect(header).toHaveTextContent('No forge link');
    expect(within(header).queryByRole('link', { name: 'Open on the forge' })).not.toBeInTheDocument();
  });

  it('links the request an issue comes from, in the same project', async () => {
    await openIssue(ISSUE.orderHistoryStatusFilter);
    const link = within(headerOf('Filter the order history by status')).getByRole('link', { name: 'R-12 · Order history is hard to use' });
    expect(link).toHaveAttribute('href', `/projects/${STOREFRONT}/requests/R-12`);
  });

  it('links the request of the project of the address, whatever another project calls a request with the same identifier', async () => {
    const snapshot = withIssue(LEDGER, LEDGER_ISSUE.overdueGracePeriod, (issue) => ({ ...issue, requestId: 'R-12' }));
    await openIssue(LEDGER_ISSUE.overdueGracePeriod, { snapshot }, LEDGER);
    const link = within(headerOf('Apply a grace period before an invoice is marked overdue')).getByRole('link', { name: 'R-12 · Bill customers by usage' });
    expect(link).toHaveAttribute('href', `/projects/${LEDGER}/requests/R-12`);
  });

  it('says that no request is behind an issue', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    expect(headerOf(TITLE_49)).toHaveTextContent('No request behind this issue');
  });

  it('names a request the project does not hold without linking it', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.orderHistoryStatusFilter, (issue) => ({ ...issue, requestId: 'R-99' }));
    await openIssue(ISSUE.orderHistoryStatusFilter, { snapshot });
    const header = headerOf('Filter the order history by status');
    expect(header).toHaveTextContent('Request R-99 is not among the requests of this project');
    expect(within(header).queryByRole('link', { name: /R-99/ })).not.toBeInTheDocument();
  });

  it('links the pull request, and says when there is none yet', async () => {
    await openIssue(ISSUE.naturalLanguageSearch);
    expect(within(headerOf('Understand colour and price words in the product search')).getByRole('link', { name: 'PR #57' })).toHaveAttribute('href', `/projects/${STOREFRONT}/pull-requests/57`);
  });

  it('says that there is no pull request and no branch yet', async () => {
    await openIssue(ISSUE.httpTimeoutRegression);
    const header = headerOf('Pin the HTTP client timeout of the checkout service');
    expect(header).toHaveTextContent('No pull request yet');
    expect(header).toHaveTextContent('No branch yet');
  });

  it('marks an issue that is paused', async () => {
    await openIssue(LEDGER_ISSUE.invoiceCsvExport, {}, LEDGER);
    expect(headerOf('Export invoices as CSV')).toHaveTextContent('Paused');
  });

  it('does not mark an issue that is not paused', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    expect(headerOf(TITLE_49)).not.toHaveTextContent('Paused');
  });

  it('offers a way back to all the issues of the project', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    expect(screen.getByRole('link', { name: 'All issues' })).toHaveAttribute('href', `/projects/${STOREFRONT}/issues`);
  });

  it('shows the type the project names, in the language of the page', async () => {
    await openIssue(ISSUE.ciPackageCache);
    expect(headerOf('Cache the package store between CI runs')).toHaveTextContent('Infrastructure and CI');
  });
});

describe('IssueDetail escalation', () => {
  it('says why an issue needs a human, what the diagnosis is and where it resumes', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const escalation = region('Needs a human');
    expect(escalation).toHaveTextContent('The implementer stopped to ask for a human decision.');
    expect(escalation).toHaveTextContent('No implementation satisfies both.');
    expect(escalation).toHaveTextContent('Escalated 21 min. ago');
    expect(escalation).toHaveTextContent('Resumes at “Implementing” once you resume it.');
  });

  it('does not repeat a diagnosis that is the reason', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.promoSavingsSummary, (issue) => ({
      ...issue,
      escalation: issue.escalation === null ? null : { ...issue.escalation, reason: 'The same words', diagnosis: 'The same words' },
    }));
    await openIssue(ISSUE.promoSavingsSummary, { snapshot });
    expect(within(region('Needs a human')).getAllByText('The same words')).toHaveLength(1);
  });

  it('says that no resume point is recorded and offers no way to resume', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.promoSavingsSummary, (issue) => ({ ...issue, resumeTarget: null }));
    await openIssue(ISSUE.promoSavingsSummary, { snapshot });
    expect(region('Needs a human')).toHaveTextContent('No resume point is recorded, so it cannot be resumed from here.');
    expect(within(headerOf(TITLE_49)).queryByRole('button', { name: /Resume/ })).not.toBeInTheDocument();
  });

  it('says that no reason was recorded for an escalation that has none', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.promoSavingsSummary, (issue) => ({ ...issue, escalation: null }));
    await openIssue(ISSUE.promoSavingsSummary, { snapshot });
    expect(region('Needs a human')).toHaveTextContent('No reason was recorded.');
  });

  it('shows no escalation for an issue that is not stopped', async () => {
    await openIssue(ISSUE.orderHistoryStatusFilter);
    expect(screen.queryByRole('region', { name: 'Needs a human' })).not.toBeInTheDocument();
  });

  it('says that an abandoned issue is abandoned, and shows no progress', async () => {
    await openIssue(ISSUE.legacyDateHelpers);
    expect(region('Abandoned')).toHaveTextContent('The factory does not work on this issue any more.');
    expect(screen.queryByRole('list', { name: 'Progress through the pipeline' })).not.toBeInTheDocument();
  });
});

describe('IssueDetail agents', () => {
  it('links the run that waits for an answer, with the question it asks', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const notice = screen.getByRole('link', { name: /The agent waits for your answer/ });
    expect(notice).toHaveAttribute('href', `/runs/${RUN.promoSavingsAsk}`);
    expect(notice).toHaveTextContent('Should the check be rewritten to expect "-4,20 €" on the French shop, or should the spec keep dollars?');
    expect(notice).toHaveTextContent(`Answer in run ${RUN.promoSavingsAsk}`);
  });

  it('links the run at work on an issue, with its last line', async () => {
    await openIssue(ISSUE.orderHistoryStatusFilter);
    const notice = screen.getByRole('link', { name: /Implementer at work on this issue/ });
    expect(notice).toHaveAttribute('href', `/runs/${RUN.statusFilterImplementer}`);
    expect(notice).toHaveTextContent('Read · web/src/design/Select.tsx');
    expect(notice).toHaveTextContent(`Follow run ${RUN.statusFilterImplementer}`);
  });

  it('says that the run has not written anything yet', async () => {
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => runs.map((run) => (run.id === RUN.statusFilterImplementer ? { ...run, lastLine: null } : run)));
    await openIssue(ISSUE.orderHistoryStatusFilter, { snapshot });
    expect(screen.getByRole('link', { name: /Implementer at work on this issue/ })).toHaveTextContent('The run has not written anything yet.');
  });

  it('prefers the run that waits for an answer when several runs are at work', async () => {
    const other = runAt(TEST_NOW, 'run_other_question', {
      role: 'reviewer',
      project: STOREFRONT,
      subject: { kind: 'issue', id: '45' },
      status: 'waiting',
      pendingQuestion: { id: 'question-1', text: 'Is the empty state in scope?', options: [], askedAt: '2026-10-12T09:50:00.000Z' },
      branch: null,
    });
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => [...runs, other]);
    await openIssue(ISSUE.orderHistoryStatusFilter, { snapshot });
    expect(screen.getByRole('link', { name: /The agent waits for your answer/ })).toHaveAttribute('href', '/runs/run_other_question');
    expect(screen.queryByRole('link', { name: /Implementer at work on this issue/ })).not.toBeInTheDocument();
  });

  it('looks for the runs of the issue only in the project of the address', async () => {
    const run = runAt(TEST_NOW, 'run_ledger_12', { project: LEDGER, subject: { kind: 'issue', id: '12' }, lastLine: 'Reading the payment code', branch: null });
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => [...runs, run]);
    await openIssue(ISSUE.localSetupDocs, { snapshot });
    expect(screen.queryByRole('link', { name: /at work on this issue/ })).not.toBeInTheDocument();
  });

  it('shows the run at work on the issue of the other project that has the same number', async () => {
    const run = runAt(TEST_NOW, 'run_ledger_12', { project: LEDGER, subject: { kind: 'issue', id: '12' }, lastLine: 'Reading the payment code', branch: null });
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => [...runs, run]);
    await openIssue(LEDGER_ISSUE.paymentIdempotencyKey, { snapshot }, LEDGER);
    expect(screen.getByRole('link', { name: /at work on this issue/ })).toHaveAttribute('href', '/runs/run_ledger_12');
  });

  it('shows no run notice when no run is at work on the issue', async () => {
    const run = runAt(TEST_NOW, 'run_done', { project: STOREFRONT, subject: { kind: 'issue', id: '45' }, status: 'succeeded', outcome: 'success', branch: null });
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => [...runs.filter((entry) => entry.id !== RUN.statusFilterImplementer), run]);
    await openIssue(ISSUE.orderHistoryStatusFilter, { snapshot });
    expect(screen.queryByRole('link', { name: /at work on this issue/ })).not.toBeInTheDocument();
  });
});

describe('IssueDetail pipeline', () => {
  const stage = (name: string): HTMLElement => within(screen.getByRole('list', { name: 'Progress through the pipeline' })).getByText(name).closest('li') as HTMLElement;

  it('lists the stages an issue goes through', async () => {
    await openIssue(ISSUE.orderHistoryStatusFilter);
    const stages = within(screen.getByRole('list', { name: 'Progress through the pipeline' })).getAllByRole('listitem');
    expect(stages.map((item) => item.textContent)).toEqual([
      'SpecDone',
      'ChecksDone',
      'ImplementationCurrent stage',
      'ReviewUpcoming',
      'EvidenceUpcoming',
      'PR and CIUpcoming',
      'MergeUpcoming',
      'ReleaseUpcoming',
      'ProductionUpcoming',
    ]);
  });

  it('shows the stages behind as done, the stage of the issue as current and the others as upcoming', async () => {
    await openIssue(ISSUE.orderHistoryStatusFilter);
    expect(stage('Spec')).toHaveTextContent('Done');
    expect(stage('Checks')).toHaveTextContent('Done');
    expect(stage('Implementation')).toHaveTextContent('Current stage');
    expect(stage('Implementation')).toHaveAttribute('aria-current', 'step');
    expect(stage('Review')).toHaveTextContent('Upcoming');
    expect(stage('Review')).not.toHaveAttribute('aria-current');
  });

  it('shows an escalated issue stopped at the stage it was in', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    expect(stage('Implementation')).toHaveTextContent('Stopped here');
    expect(stage('Implementation')).toHaveAttribute('aria-current', 'step');
    expect(stage('Checks')).toHaveTextContent('Done');
    expect(stage('PR and CI')).toHaveTextContent('Upcoming');
  });

  it('shows a closed issue as having passed every stage', async () => {
    await openIssue(ISSUE.localSetupDocs);
    const stages = within(screen.getByRole('list', { name: 'Progress through the pipeline' })).getAllByRole('listitem');
    expect(stages.every((item) => item.textContent?.endsWith('Done'))).toBe(true);
  });

  it('starts an issue whose spec is a draft at the first stage', async () => {
    await openIssue(ISSUE.httpTimeoutRegression);
    expect(stage('Spec')).toHaveTextContent('Current stage');
    expect(stage('Checks')).toHaveTextContent('Upcoming');
  });

  it('places an issue that waits on a dependency at the first stage', async () => {
    await openIssue(ISSUE.deliveryDateEstimate);
    expect(stage('Spec')).toHaveTextContent('Current stage');
  });

  it('gives an escalated issue with no resume point no stage', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.promoSavingsSummary, (issue) => ({ ...issue, resumeTarget: null }));
    await openIssue(ISSUE.promoSavingsSummary, { snapshot });
    const stages = within(screen.getByRole('list', { name: 'Progress through the pipeline' })).getAllByRole('listitem');
    expect(stages.every((item) => item.textContent?.endsWith('Upcoming'))).toBe(true);
  });
});

describe('IssueDetail specification', () => {
  it('shows the need, the acceptance criteria in order, what is out of scope and the proof expected', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const spec = region('Specification');
    expect(spec).toHaveTextContent('Customers cannot see what a promo code saved them until the payment step.');
    const items = within(spec).getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toEqual([
      'The cart summary shows the amount saved by an applied promo code, in the currency of the shop.',
      'The line disappears when no code is applied.',
      'Removing the code removes the line and restores the total.',
      'Showing the savings in the order history',
    ]);
    expect(spec).toHaveTextContent('A browser journey on the French shop that applies WELCOME10 and reads the savings line.');
  });

  it('says that nothing is out of scope and that no criterion is written', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.promoSavingsSummary, (issue) => ({ ...issue, spec: { ...issue.spec, acceptanceCriteria: [], outOfScope: [] } }));
    await openIssue(ISSUE.promoSavingsSummary, { snapshot });
    const spec = region('Specification');
    expect(spec).toHaveTextContent('No acceptance criterion is written.');
    expect(spec).toHaveTextContent('Nothing is declared out of scope.');
    expect(within(spec).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('says that the need and the proof are not stated when they are empty', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.promoSavingsSummary, (issue) => ({ ...issue, spec: { ...issue.spec, need: ' ', expectedProof: '' } }));
    await openIssue(ISSUE.promoSavingsSummary, { snapshot });
    expect(within(region('Specification')).getAllByText('Not stated')).toHaveLength(2);
  });
});

describe('IssueDetail dependencies', () => {
  const group = (name: string): HTMLElement => within(region('Dependencies')).getByText(name).closest('div') as HTMLElement;

  it('shows what an issue waits for with the state of each, and what waits for it', async () => {
    await openIssue(ISSUE.deliveryDateEstimate);
    const waitsFor = within(group('Waits for')).getByRole('link', { name: /Remember the delivery address between orders/ });
    expect(waitsFor).toHaveAttribute('href', `/projects/${STOREFRONT}/issues/61`);
    expect(waitsFor).toHaveTextContent('#61');
    expect(waitsFor).toHaveTextContent('Review');
    const blocks = within(group('Blocks')).getByRole('link', { name: /Offer an express delivery option at checkout/ });
    expect(blocks).toHaveAttribute('href', `/projects/${STOREFRONT}/issues/73`);
    expect(blocks).toHaveTextContent('Blocked');
  });

  it('says how many dependencies are not merged yet, in the singular', async () => {
    await openIssue(ISSUE.deliveryDateEstimate);
    expect(region('Dependencies')).toHaveTextContent('1 dependency is not merged yet.');
  });

  it('says how many dependencies are not merged yet, in the plural', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.deliveryDateEstimate, (issue) => ({ ...issue, dependsOn: [ISSUE.savedDeliveryAddress, ISSUE.orderHistoryStatusFilter] }));
    await openIssue(ISSUE.deliveryDateEstimate, { snapshot });
    expect(region('Dependencies')).toHaveTextContent('2 dependencies are not merged yet.');
  });

  it('does not count a dependency that is merged', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.deliveryDateEstimate, (issue) => ({ ...issue, dependsOn: [ISSUE.orderHistoryPagination] }));
    await openIssue(ISSUE.deliveryDateEstimate, { snapshot });
    expect(region('Dependencies')).not.toHaveTextContent('not merged yet');
  });

  it('says that an issue waits for nothing and that nothing waits for it', async () => {
    await openIssue(ISSUE.localSetupDocs);
    expect(group('Waits for')).toHaveTextContent('It waits for no other issue.');
    expect(group('Blocks')).toHaveTextContent('No other issue waits for it.');
    expect(region('Dependencies')).not.toHaveTextContent('not merged yet');
  });

  it('names an issue the project does not hold without linking it', async () => {
    await openIssue(LEDGER_ISSUE.creditNotes, {}, LEDGER);
    const waitsFor = group('Waits for');
    expect(waitsFor).toHaveTextContent('#31');
    expect(waitsFor).toHaveTextContent('Not in this project');
    expect(within(waitsFor).queryByRole('link')).not.toBeInTheDocument();
    expect(region('Dependencies')).not.toHaveTextContent('not merged yet');
  });

  it('counts as waiting for an issue only the issues of the same project', async () => {
    const snapshot = withIssue(LEDGER, LEDGER_ISSUE.overdueGracePeriod, (issue) => ({ ...issue, dependsOn: [ISSUE.localSetupDocs] }));
    await openIssue(ISSUE.localSetupDocs, { snapshot });
    expect(group('Blocks')).toHaveTextContent('No other issue waits for it.');
  });

  it('lists the issues of the project that wait for this one', async () => {
    const snapshot = withIssue(LEDGER, LEDGER_ISSUE.overdueGracePeriod, (issue) => ({ ...issue, dependsOn: [LEDGER_ISSUE.paymentIdempotencyKey] }));
    await openIssue(LEDGER_ISSUE.paymentIdempotencyKey, { snapshot }, LEDGER);
    const blocks = within(group('Blocks')).getByRole('link', { name: /Apply a grace period before an invoice is marked overdue/ });
    expect(blocks).toHaveAttribute('href', `/projects/${LEDGER}/issues/29`);
  });

  it('warns that issues which wait for each other can never start', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.savedDeliveryAddress, (issue) => ({ ...issue, dependsOn: [ISSUE.deliveryDateEstimate] }));
    await openIssue(ISSUE.deliveryDateEstimate, { snapshot });
    const note = within(region('Dependencies')).getByRole('note');
    expect(note).toHaveTextContent('Circular dependency');
    expect(note).toHaveTextContent('#61 and #70 wait for each other, so none of them can start.');
  });

  it('shows no warning for an issue outside a circle', async () => {
    await openIssue(ISSUE.deliveryDateEstimate);
    expect(within(region('Dependencies')).queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('IssueDetail acceptance checks', () => {
  it('says what the checks must show on the base and when they were frozen', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const checks = region('Acceptance checks');
    expect(checks).toHaveTextContent('Must fail on the base');
    expect(checks).toHaveTextContent('Frozen Oct 12, 2026, 1:23 AM');
  });

  it('shows for a check its path, its runner, what it must do on the base and what it did', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const check = within(screen.getByRole('list', { name: 'Acceptance checks' })).getByRole('listitem');
    expect(check).toHaveTextContent('e2e/cart/promo-savings.spec.ts');
    expect(check).toHaveTextContent('Runner: Playwright');
    expect(check).toHaveTextContent('Expected to fail on the base');
    expect(check).toHaveTextContent('Fails on the base');
    expect(check).toHaveTextContent('The cart summary has no savings line.');
  });

  it('shows the short hash of a frozen check and the full one on hover', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const hash = screen.getByText(/Frozen a23d99da9b6b/);
    expect(hash).toHaveAttribute('title', 'a23d99da9b6b240c640be4921291e80866fd1dd1cb2c4fd7c83d028ac57e7676');
  });

  it('shows the screenshot of the base as an image that opens in a new tab', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const image = screen.getByRole('img', { name: 'Screenshot of the base for e2e/cart/promo-savings.spec.ts' });
    expect(image).toHaveAttribute('src', '/api/projects/storefront/evidence/49/checks/promo-savings-before.png');
    expect(image.closest('a')).toHaveAttribute('href', '/api/projects/storefront/evidence/49/checks/promo-savings-before.png');
    expect(image.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('shows a screenshot only for the check that has one', async () => {
    await openIssue(ISSUE.orderHistoryStatusFilter);
    const checks = within(screen.getByRole('list', { name: 'Acceptance checks' })).getAllByRole('listitem');
    expect(checks).toHaveLength(2);
    expect(within(checks[0] as HTMLElement).getByRole('img')).toBeInTheDocument();
    expect(within(checks[1] as HTMLElement).queryByRole('img')).not.toBeInTheDocument();
    expect(checks[1]).toHaveTextContent('The page cannot be filtered, so it never says that no order matches.');
  });

  it('says that there is no check yet', async () => {
    await openIssue(ISSUE.searchPriceSort);
    const checks = region('Acceptance checks');
    expect(checks).toHaveTextContent('No acceptance check yet');
    expect(checks).toHaveTextContent('The checks author writes them from the criteria, before any implementation.');
    expect(checks).toHaveTextContent('Not frozen yet');
    expect(screen.queryByRole('list', { name: 'Acceptance checks' })).not.toBeInTheDocument();
  });

  it('says what is not known yet about a check whose manifest is not written', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.orderHistoryStatusFilter, (issue) => ({
      ...issue,
      checksFrozenAt: null,
      checks: [checkOf({ runner: null, sha256: null, onBase: null, before: { result: 'not-run', detail: '', score: null, screenshotUrl: null } })],
    }));
    await openIssue(ISSUE.orderHistoryStatusFilter, { snapshot });
    const check = within(screen.getByRole('list', { name: 'Acceptance checks' })).getByRole('listitem');
    expect(check).toHaveTextContent('Manifest not written yet');
    expect(check).toHaveTextContent('Expectation on the base not set yet');
    expect(check).toHaveTextContent('Not frozen');
    expect(check).toHaveTextContent('Not run');
    expect(region('Acceptance checks')).toHaveTextContent('Not frozen yet');
    expect(within(check).queryByText(/^Frozen /)).not.toBeInTheDocument();
  });

  it('shows the score of a check that scored on the base, and says when it was not recorded', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.orderHistoryStatusFilter, (issue) => ({
      ...issue,
      checks: [
        checkOf({ path: 'evals/a.json', before: { result: 'scored', detail: '', score: 0.4234, screenshotUrl: null } }),
        checkOf({ path: 'evals/b.json', before: { result: 'scored', detail: '', score: null, screenshotUrl: null } }),
      ],
    }));
    await openIssue(ISSUE.orderHistoryStatusFilter, { snapshot });
    const [first, second] = within(screen.getByRole('list', { name: 'Acceptance checks' })).getAllByRole('listitem');
    expect(first).toHaveTextContent('Base score');
    expect(first).toHaveTextContent('Score 0.42');
    expect(second).toHaveTextContent('Score not recorded');
  });

  it('shows no score for a check that is not a score', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const check = within(screen.getByRole('list', { name: 'Acceptance checks' })).getByRole('listitem');
    expect(check).not.toHaveTextContent('Score');
  });
});

describe('IssueDetail attempts', () => {
  it('lists the attempts in order with their kind, their outcome and their summary', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const attempts = within(screen.getByRole('list', { name: 'Attempts of the implementer' })).getAllByRole('listitem');
    expect(attempts).toHaveLength(4);
    expect(attempts[0]).toHaveTextContent('1. Session');
    expect(attempts[0]).toHaveTextContent('Error');
    expect(attempts[0]).toHaveTextContent('The session used its 150 turns without making the frozen journey pass.');
    expect(attempts[1]).toHaveTextContent('2. Correction');
    expect(attempts[3]).toHaveTextContent('4. Fresh session');
    expect(attempts[3]).toHaveTextContent('Gate failed');
  });

  it('gives the model, the effort, the duration and the run of each attempt', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const [first, , , last] = within(screen.getByRole('list', { name: 'Attempts of the implementer' })).getAllByRole('listitem');
    expect(first).toHaveTextContent('claude-sonnet-5-5');
    expect(first).toHaveTextContent('Effort: High');
    expect(first).toHaveTextContent('58 min');
    expect(within(first as HTMLElement).getByRole('link', { name: 'run_2e6b40' })).toHaveAttribute('href', '/runs/run_2e6b40');
    expect(last).toHaveTextContent('claude-opus-5-5');
    expect(last).toHaveTextContent('Effort: Very high');
    expect(within(last as HTMLElement).getByRole('link', { name: RUN.promoSavingsAsk })).toHaveAttribute('href', `/runs/${RUN.promoSavingsAsk}`);
  });

  it('says for how long an attempt has been running', async () => {
    await openIssue(ISSUE.orderHistoryStatusFilter);
    const attempt = within(screen.getByRole('list', { name: 'Attempts of the implementer' })).getByRole('listitem');
    expect(attempt).toHaveTextContent('1. Session');
    expect(attempt).toHaveTextContent('Running');
    expect(attempt).toHaveTextContent('Running for 14 min');
    expect(attempt).not.toHaveTextContent('No summary was recorded.');
  });

  it('says that a finished attempt left no summary and no run', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.orderHistoryStatusFilter, (issue) => ({ ...issue, attempts: [attemptOf({ summary: '', runId: '' })] }));
    await openIssue(ISSUE.orderHistoryStatusFilter, { snapshot });
    const attempt = within(screen.getByRole('list', { name: 'Attempts of the implementer' })).getByRole('listitem');
    expect(attempt).toHaveTextContent('No summary was recorded.');
    expect(attempt).toHaveTextContent('No run recorded');
    expect(within(attempt).queryByRole('link')).not.toBeInTheDocument();
    expect(attempt).toHaveTextContent('30 min');
  });

  it('says that no attempt was made yet', async () => {
    await openIssue(ISSUE.searchPriceSort);
    const attempts = region('Attempts');
    expect(attempts).toHaveTextContent('No attempt yet');
    expect(attempts).toHaveTextContent('The implementation starts once the checks are frozen.');
    expect(screen.queryByRole('list', { name: 'Attempts of the implementer' })).not.toBeInTheDocument();
  });

  it('explains how failed attempts are retried', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    expect(region('Attempts')).toHaveTextContent('A failed attempt is corrected in the same session first, then retried in a fresh and stronger session, before a human takes over.');
  });
});

describe('IssueDetail cost', () => {
  it('shows what the issue cost with what the figure means, and explains it once', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const cost = region('Cost');
    expect(cost).toHaveTextContent('$16.68API-equivalent');
    expect(within(cost).getAllByRole('note')).toHaveLength(1);
    expect(cost).toHaveTextContent('Dollar figures are API-equivalent prices');
    expect(screen.getAllByRole('note').filter((note) => note.textContent?.includes('Dollar figures'))).toHaveLength(1);
  });

  it('names the metered price when the installation is billed per token', async () => {
    const base = fixtureSnapshot();
    await openIssue(ISSUE.promoSavingsSummary, { snapshot: { ...base, costs: { ...base.costs, basis: 'metered' } } });
    const cost = region('Cost');
    expect(cost).toHaveTextContent('$16.68Metered');
    expect(cost).toHaveTextContent('Dollar figures are metered prices');
    expect(cost).not.toHaveTextContent('API-equivalent');
  });

  it('gives the runs and the tokens behind the cost, stated with and without the cache', async () => {
    await openIssue(ISSUE.promoSavingsSummary);
    const cost = region('Cost');
    expect(cost).toHaveTextContent('5 agent runs');
    expect(cost).toHaveTextContent('Including cache33,632,882');
    expect(cost).toHaveTextContent('Excluding cache231,082');
  });

  it('takes the runs and the tokens of the issue of the project of the address, not of another project with the same number', async () => {
    await openIssue(ISSUE.httpClientBump);
    expect(region('Cost')).toHaveTextContent('2 agent runs');
    expect(region('Cost')).toHaveTextContent('Including cache1,321,429');
  });

  it('takes them from the other project when the address is that project', async () => {
    await openIssue(LEDGER_ISSUE.webhookSignatures, {}, LEDGER);
    expect(region('Cost')).toHaveTextContent('4 agent runs');
    expect(region('Cost')).toHaveTextContent('Including cache5,465,078');
  });

  it('says that no run or token figure is recorded when the installation holds none for the issue', async () => {
    const base = fixtureSnapshot();
    const snapshot = { ...base, costs: { ...base.costs, byIssue: base.costs.byIssue.filter((entry) => !(entry.project === STOREFRONT && entry.issueNumber === ISSUE.promoSavingsSummary)) } };
    await openIssue(ISSUE.promoSavingsSummary, { snapshot });
    const cost = region('Cost');
    expect(cost).toHaveTextContent('$16.68API-equivalent');
    expect(cost).toHaveTextContent('No run or token figure is recorded for this issue yet.');
    expect(cost).not.toHaveTextContent('agent runs');
  });

  it('shows a cost of zero for an issue no agent worked on', async () => {
    await openIssue(ISSUE.httpTimeoutRegression);
    expect(region('Cost')).toHaveTextContent('$0.00API-equivalent');
  });
});

describe('IssueDetail in French', () => {
  it('words the header, the notices and the sections in French', async () => {
    await openIssue(ISSUE.promoSavingsSummary, { locale: 'fr' });
    const header = headerOf(TITLE_49);
    expect(header).toHaveTextContent('Intervention requise');
    expect(header).toHaveTextContent('Aucune demande à l’origine de cette issue');
    expect(header).toHaveTextContent('Pas encore de pull request');
    expect(header).toHaveTextContent('Mise à jour il y a 21 min');
    expect(region('Intervention requise')).toHaveTextContent('Escaladée il y a 21 min');
    expect(region('Intervention requise')).toHaveTextContent('Reprendra à « Implémentation » dès que vous la reprendrez.');
    for (const name of ['Spécification', 'Dépendances', 'Checks d’acceptation', 'Tentatives', 'Coût']) expect(region(name)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /L’agent attend votre réponse/ })).toBeInTheDocument();
  });

  it('words the attempts, the checks and the cost in French', async () => {
    await openIssue(ISSUE.promoSavingsSummary, { locale: 'fr' });
    const attempts = within(screen.getByRole('list', { name: 'Tentatives de l’implémenteur' })).getAllByRole('listitem');
    expect(attempts[0]).toHaveTextContent('1. Session');
    expect(attempts[0]).toHaveTextContent('Effort : Élevé');
    expect(attempts[3]).toHaveTextContent('4. Nouvelle session');
    expect(region('Checks d’acceptation')).toHaveTextContent('Gelés le 12 oct. 2026');
    expect(region('Coût')).toHaveTextContent('5 runs d’agent');
    expect(region('Coût')).toHaveTextContent('Équivalent API');
  });

  it('uses the singular of the dependencies in French', async () => {
    await openIssue(ISSUE.deliveryDateEstimate, { locale: 'fr' });
    expect(region('Dépendances')).toHaveTextContent('1 dépendance n’est pas encore mergée.');
  });

  it('uses the plural of the dependencies in French', async () => {
    const snapshot = withIssue(STOREFRONT, ISSUE.deliveryDateEstimate, (issue) => ({ ...issue, dependsOn: [ISSUE.savedDeliveryAddress, ISSUE.orderHistoryStatusFilter] }));
    await openIssue(ISSUE.deliveryDateEstimate, { locale: 'fr', snapshot });
    expect(region('Dépendances')).toHaveTextContent('2 dépendances ne sont pas encore mergées.');
  });

  it('words the progress through the pipeline in French', async () => {
    await openIssue(ISSUE.promoSavingsSummary, { locale: 'fr' });
    const stages = within(screen.getByRole('list', { name: 'Avancement dans la chaîne' })).getAllByRole('listitem');
    expect(stages[2]).toHaveTextContent('Implémentation');
    expect(stages[2]).toHaveTextContent('Arrêtée ici');
    expect(stages[0]).toHaveTextContent('Terminée');
  });
});
