import type { Locator, Page } from '@playwright/test';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { ONE_LOOK, untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { issueOf, projectOf, pullRequestOf } from '../../support/api.ts';
import { openCockpit, recordCommandsSent } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { expectDecisionListed } from '../../support/decisions.ts';
import { AGENT_WORK_TEST_TIMEOUT_MS, AGENT_WORK_TIMEOUT_MS, untilNoAgentIsWorking } from '../../support/factory-activity.ts';
import { english } from '../../support/formats.ts';
import { firstOf, issueNamed } from '../../support/project-facts.ts';
import { waitingRunOf } from '../../support/run-facts.ts';
import { CART_BADGE_TOTAL, CATEGORY_FILTER, DISCOUNT_ROUNDING, GIFT_PICKS_TITLE, LEDGER, ORDER_HISTORY_PAGINATION, STOREFRONT, TAX_ROUNDING } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const NO_PULL_REQUEST = 'No pull request yet';
const STORY_ISSUES = [
  { title: CATEGORY_FILTER.spec.title, state: 'Merged' },
  { title: CART_BADGE_TOTAL.spec.title, state: 'Pull request open' },
  { title: DISCOUNT_ROUNDING.spec.title, state: 'Needs a human' },
  { title: ORDER_HISTORY_PAGINATION.spec.title, state: 'Queued' },
  { title: GIFT_PICKS_TITLE, state: 'Spec to validate' },
] as const;
const PIPELINE_AT_OPEN_PULL_REQUEST = [
  { stage: 'Spec', status: 'Done' },
  { stage: 'Checks', status: 'Done' },
  { stage: 'Implementation', status: 'Done' },
  { stage: 'Review', status: 'Done' },
  { stage: 'Evidence', status: 'Done' },
  { stage: 'PR and CI', status: 'Current stage' },
  { stage: 'Merge', status: 'Upcoming' },
  { stage: 'Release', status: 'Upcoming' },
  { stage: 'Production', status: 'Upcoming' },
] as const;
const PIPELINE_AT_QUESTION = [
  { stage: 'Spec', status: 'Done' },
  { stage: 'Checks', status: 'Done' },
  { stage: 'Implementation', status: 'Stopped here' },
  { stage: 'Review', status: 'Upcoming' },
] as const;
const ZOOM_STEP_PERCENT = 10;
const FULL_ZOOM_PERCENT = 100;
const SETTLED_ISSUE_STATES: readonly string[] = ['pr-open', 'needs-human'];

function issueTable(page: Page): Locator {
  return page.getByRole('table', { name: 'Issues of the project' });
}

function pipelineStage(page: Page, stage: string, status: string): Locator {
  return page.getByRole('list', { name: 'Progress through the pipeline' }).getByRole('listitem').filter({ hasText: new RegExp(`^${stage}\\s*${status}$`) });
}

function pullRequestWords(number: number | null): string {
  return number === null ? NO_PULL_REQUEST : `PR #${number}`;
}

test.describe('the issues of the demonstration', () => {
  test('lists the issues of a project with their state and their pull request', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.issues(STOREFRONT));
    await untilPageAgreesWithFactory(async () => {
      const { issues } = projectOf(await factory.api.state(), STOREFRONT);
      await expect(page.getByRole('heading', { level: 1, name: `Issues ${issues.length} in total` })).toBeVisible(ONE_LOOK);
      await expect(issueTable(page).getByRole('row')).toHaveCount(issues.length + 1, ONE_LOOK);
      await expect(page.getByRole('status').filter({ hasText: /^\d+ of \d+ issues?$/ })).toHaveText(`${issues.length} of ${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`, ONE_LOOK);
    });
    const state = await factory.api.state();
    for (const { title, state: stateWords } of STORY_ISSUES) {
      const issue = issueNamed(state, STOREFRONT, title);
      const row = issueTable(page).getByRole('row', { name: title });
      await expect(row).toContainText(`#${issue.number}`);
      await expect(row).toContainText(stateWords);
      await expect(row).toContainText(pullRequestWords(issue.pullRequestNumber));
      if (issue.pullRequestNumber !== null) await expect(row.getByRole('link', { name: pullRequestWords(issue.pullRequestNumber) })).toHaveAttribute('href', paths.pullRequest(STOREFRONT, issue.pullRequestNumber));
    }
  });

  test('narrows the issues by progress, by words and by type, and clears the filters', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.issues(STOREFRONT));
    const table = issueTable(page);
    await page.getByRole('radio', { name: /^Delivered/ }).click();
    await expect(table.getByRole('row', { name: CATEGORY_FILTER.spec.title })).toBeVisible();
    await expect(table.getByRole('row', { name: CART_BADGE_TOTAL.spec.title })).toHaveCount(0);

    await page.getByRole('radio', { name: /^All/ }).click();
    await page.getByRole('searchbox', { name: 'Filter by title or number' }).fill('badge');
    await expect(table.getByRole('row', { name: CART_BADGE_TOTAL.spec.title })).toBeVisible();
    await expect(table.getByRole('row', { name: CATEGORY_FILTER.spec.title })).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /^\d+ of \d+ issues?$/ })).toHaveText(/^1 of \d+ issues?$/);

    await page.getByRole('button', { name: 'Clear the filters' }).click();
    await expect(page.getByRole('searchbox', { name: 'Filter by title or number' })).toHaveValue('');
    await expect(table.getByRole('row', { name: CATEGORY_FILTER.spec.title })).toBeVisible();

    await page.getByRole('combobox', { name: 'Issue type' }).selectOption({ label: 'Fix' });
    await expect(table.getByRole('row', { name: DISCOUNT_ROUNDING.spec.title })).toBeVisible();
    await expect(table.getByRole('row', { name: CART_BADGE_TOTAL.spec.title })).toHaveCount(0);
  });

  test('draws the dependency graph, names what each issue waits for and zooms it', async ({ page, factory }) => {
    const state = await factory.api.state();
    const waiting = issueNamed(state, STOREFRONT, ORDER_HISTORY_PAGINATION.spec.title);
    await openCockpit(page, factory, paths.issues(STOREFRONT));
    await page.getByRole('radio', { name: 'Graph' }).click();
    await expect(page).toHaveURL(new URL(paths.issueGraph(STOREFRONT), factory.origin).href);
    await expect(page.getByRole('radio', { name: 'Graph' })).toBeChecked();

    const graph = page.getByRole('region', { name: 'Dependency graph of the issues' });
    await untilPageAgreesWithFactory(async () => {
      const { issues } = projectOf(await factory.api.state(), STOREFRONT);
      await expect(graph.getByRole('list', { name: 'Issues of the graph' }).getByRole('link')).toHaveCount(issues.length, ONE_LOOK);
    });
    await expect(page.getByRole('list', { name: 'Legend' })).toContainText('Dependency: the arrow points to the issue that waits');
    await expect(graph.getByRole('link', { name: ORDER_HISTORY_PAGINATION.spec.title })).toHaveAccessibleDescription(
      `Waits for ${english.list(waiting.dependsOn.map((number) => `#${number}`))}`,
    );

    const zoom = page.getByRole('group', { name: 'Zoom' });
    const zoomValue = zoom.getByRole('status', { name: 'Current zoom' });
    await expect(zoomValue).toHaveText(english.percentPoints(FULL_ZOOM_PERCENT));
    await expect(zoom.getByRole('button', { name: 'Reset the zoom' })).toBeDisabled();
    await zoom.getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoomValue).toHaveText(english.percentPoints(FULL_ZOOM_PERCENT + ZOOM_STEP_PERCENT));
    await zoom.getByRole('button', { name: 'Zoom out' }).click();
    await zoom.getByRole('button', { name: 'Zoom out' }).click();
    await expect(zoomValue).toHaveText(english.percentPoints(FULL_ZOOM_PERCENT - ZOOM_STEP_PERCENT));
    await zoom.getByRole('button', { name: 'Reset the zoom' }).click();
    await expect(zoomValue).toHaveText(english.percentPoints(FULL_ZOOM_PERCENT));

    await page.getByRole('radio', { name: 'Table' }).click();
    await expect(page).not.toHaveURL(/view=graph/);
    await expect(issueTable(page)).toBeVisible();
  });

  test('opens an issue from the graph', async ({ page, factory }) => {
    const issue = issueNamed(await factory.api.state(), STOREFRONT, CART_BADGE_TOTAL.spec.title);
    await openCockpit(page, factory, paths.issueGraph(STOREFRONT));
    await page.getByRole('region', { name: 'Dependency graph of the issues' }).getByRole('link', { name: CART_BADGE_TOTAL.spec.title }).click();
    await expect(page).toHaveURL(new URL(paths.issue(STOREFRONT, issue.number), factory.origin).href);
    await expect(page.getByRole('heading', { level: 1, name: CART_BADGE_TOTAL.spec.title })).toBeVisible();
  });

  test('shows the attempts, the checks and the pull request of an issue whose pull request is open', async ({ page, factory }) => {
    const state = await factory.api.state();
    const issue = issueNamed(state, STOREFRONT, CART_BADGE_TOTAL.spec.title);
    const attempt = firstOf(issue.attempts, `attempt of issue #${issue.number}`);
    const check = firstOf(issue.checks, `acceptance check of issue #${issue.number}`);
    const pullRequestNumber = issue.pullRequestNumber;
    if (pullRequestNumber === null || issue.checksFrozenAt === null) throw new Error(`issue #${issue.number} has no open pull request or no frozen checks`);
    await openCockpit(page, factory, paths.issue(STOREFRONT, issue.number));
    const detail = page.getByRole('article');
    await expect(detail.getByRole('heading', { level: 1, name: issue.title })).toBeVisible();
    await expect(detail).toContainText('Pull request open');
    await expect(detail).toContainText(`#${issue.number}`);
    await expect(detail.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
    await expect(detail.getByRole('button', { name: 'Rewrite a check' })).toBeEnabled();

    for (const { stage, status } of PIPELINE_AT_OPEN_PULL_REQUEST) await expect(pipelineStage(page, stage, status)).toHaveCount(1);
    await expect(pipelineStage(page, 'PR and CI', 'Current stage')).toHaveAttribute('aria-current', 'step');

    const specification = page.getByRole('region', { name: 'Specification' });
    await expect(specification).toContainText(issue.spec.need);
    for (const criterion of issue.spec.acceptanceCriteria) await expect(specification).toContainText(criterion);

    const checks = page.getByRole('region', { name: 'Acceptance checks' });
    await expect(checks).toContainText('Must fail on the base');
    await expect(checks).toContainText(english.dateTime(issue.checksFrozenAt));
    const checkItem = checks.getByRole('list', { name: 'Acceptance checks' }).getByRole('listitem').filter({ hasText: check.path });
    await expect(checkItem).toContainText('Runner: Node test runner');
    await expect(checkItem).toContainText('Expected to fail on the base');
    await expect(checkItem).toContainText('Fails on the base');
    await expect(checkItem).toContainText('Frozen');
    if (check.before.screenshotUrl !== null) {
      await expect(checkItem.getByRole('img', { name: `Screenshot of the base for ${check.path}` })).toBeVisible();
      expect((await page.request.get(`${factory.origin}${check.before.screenshotUrl}`)).ok(), 'the screenshot of the base is served').toBe(true);
    }

    const attempts = page.getByRole('region', { name: 'Attempts' }).getByRole('list', { name: 'Attempts of the implementer' });
    await expect(attempts.getByRole('listitem')).toHaveCount(issue.attempts.length);
    const attemptItem = attempts.getByRole('listitem').first();
    await expect(attemptItem).toContainText('1. Session');
    await expect(attemptItem).toContainText('Passed');
    await expect(attemptItem).toContainText(attempt.model);
    await expect(attemptItem.getByRole('link', { name: attempt.runId })).toHaveAttribute('href', paths.run(attempt.runId));

    const dependents = projectOf(state, STOREFRONT).issues.filter((candidate) => candidate.dependsOn.includes(issue.number));
    const dependencies = page.getByRole('region', { name: 'Dependencies' });
    await expect(dependencies).toContainText('It waits for no other issue.');
    for (const dependent of dependents) await expect(dependencies.getByRole('link', { name: `#${dependent.number} ${dependent.title}` })).toHaveAttribute('href', paths.issue(STOREFRONT, dependent.number));

    await detail.getByRole('link', { name: `PR #${pullRequestNumber}` }).click();
    await expect(page).toHaveURL(new URL(paths.pullRequest(STOREFRONT, pullRequestNumber), factory.origin).href);
    await expect(page.getByRole('heading', { level: 1, name: pullRequestOf(state, STOREFRONT, pullRequestNumber).title })).toBeVisible();
  });

  test('shows what stops an issue that needs a human and the question its agent waits on, without acting on it', async ({ page, factory }) => {
    const state = await factory.api.state();
    const issue = issueNamed(state, STOREFRONT, DISCOUNT_ROUNDING.spec.title);
    const escalation = issue.escalation;
    const waiting = waitingRunOf(state);
    if (escalation === null) throw new Error(`issue #${issue.number} does not need a human`);
    const sent = recordCommandsSent(page);
    await openCockpit(page, factory, paths.issue(STOREFRONT, issue.number));
    const detail = page.getByRole('article');
    await expect(detail.getByRole('heading', { level: 1, name: issue.title })).toBeVisible();
    await expect(detail).toContainText('Needs a human');
    await expect(detail).toContainText(`#${issue.number}`);

    const stop = page.getByRole('region', { name: 'Needs a human', exact: true });
    await expect(stop).toContainText(escalation.reason);
    await expect(stop).toContainText(/Resumes at .+ once you resume it\./);
    const question = detail.getByRole('link', { name: /^The agent waits for your answer/ });
    await expect(question).toContainText(waiting.pendingQuestion.text);
    await expect(question).toHaveAttribute('href', paths.run(waiting.id));

    for (const { stage, status } of PIPELINE_AT_QUESTION) await expect(pipelineStage(page, stage, status)).toHaveCount(1);
    await expect(pipelineStage(page, 'Implementation', 'Stopped here')).toHaveAttribute('aria-current', 'step');
    await expect(detail).toContainText(NO_PULL_REQUEST);
    await expect(detail.getByRole('button', { name: /^Resume at/ })).toBeEnabled();
    await expect(detail.getByRole('button', { name: 'Rewrite a check' })).toBeEnabled();
    await expect(detail.getByRole('button', { name: 'Abandon' })).toBeEnabled();
    await expect(detail.getByRole('button', { name: 'Validate spec' })).toHaveCount(0);
    expect(sent).toEqual([]);
  });

  test('marks on the issue what its orchestrator decided in the operator\'s place, and marks nothing on an issue the operator took', async ({ page, factory }) => {
    const state = await factory.api.state();
    const delegated = issueNamed(state, STOREFRONT, DISCOUNT_ROUNDING.spec.title);
    const [decision] = delegated.delegated;
    if (decision === undefined) throw new Error(`the orchestrator made no gesture on issue #${delegated.number}`);
    expect(decision.reason).toBe(DISCOUNT_ROUNDING.delegatedValidation);
    await openCockpit(page, factory, paths.issue(STOREFRONT, delegated.number));
    const mark = page.getByRole('region', { name: 'Decided without you', exact: true });
    await expect(mark).toContainText(`The gestures ${decision.actor} made on this item.`);
    const items = mark.getByRole('list', { name: 'Delegated decisions' }).getByRole('listitem');
    await expect(items).toHaveCount(delegated.delegated.length);
    await expectDecisionListed(items.first(), STOREFRONT, decision);

    const taken = issueNamed(state, STOREFRONT, CART_BADGE_TOTAL.spec.title);
    expect(taken.delegated).toEqual([]);
    await openCockpit(page, factory, paths.issue(STOREFRONT, taken.number));
    await expect(page.getByRole('heading', { level: 1, name: taken.title })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Decided without you', exact: true })).toHaveCount(0);
  });

  test('validates the spec of a draft from its issue page and lets the factory take the issue', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    const draft = issueNamed(await factory.api.state(), LEDGER, TAX_ROUNDING.spec.title);
    expect(draft.state).toBe('spec-draft');
    await openCockpit(page, factory, paths.issue(LEDGER, draft.number));
    await expect(page.getByRole('heading', { level: 1, name: draft.title })).toBeVisible();
    await expect(page.getByRole('article')).toContainText('Spec to validate');

    const outcome = await clickCommand(page, 'issue.validate-spec', async () => {
      await page.getByRole('button', { name: 'Validate spec' }).click();
    });
    expect(outcome.effect).toMatch(new RegExp(`^The spec of issue #${draft.number} is validated and labelled .+; the daemon picks it up at its next tick$`));

    await factory.api.until('the issue leaves the draft state', (state) => issueOf(state, LEDGER, draft.number).state !== 'spec-draft');
    await expect(page.getByRole('button', { name: 'Validate spec' })).toHaveCount(0);
    await expect(page.getByRole('article')).not.toContainText('Spec to validate');

    const settled = await factory.api.until('the factory finished its first pass on the issue', (state) => SETTLED_ISSUE_STATES.includes(issueOf(state, LEDGER, draft.number).state), {
      timeoutMs: AGENT_WORK_TIMEOUT_MS,
    });
    expect(issueOf(settled, LEDGER, draft.number).state).toBe('pr-open');
    await untilNoAgentIsWorking(factory);
    await expect(page.getByRole('article').getByRole('link', { name: /^PR #\d+$/ })).toBeVisible();
  });
});
