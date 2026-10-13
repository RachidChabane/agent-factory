import type { Locator, Page } from '@playwright/test';
import {
  forgeFilePath,
  pullRequestDiffPath,
  repositoryFilePath,
  type AcceptanceTestRowView,
  type CheckConclusion,
  type Evidence,
  type PullRequestView,
} from '../../../packages/cockpit/src/contract/index.ts';
import { shortSha } from '../../../packages/cockpit/src/model/identifiers.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { ONE_LOOK, untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { issueOf, projectOf, pullRequestOf } from '../../support/api.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { AGENT_WORK_TEST_TIMEOUT_MS, AGENT_WORK_TIMEOUT_MS, untilNoAgentIsWorking } from '../../support/factory-activity.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { english } from '../../support/formats.ts';
import { firstOf, issueNamed, pullRequestOfIssue } from '../../support/project-facts.ts';
import { CART_BADGE_TOTAL, CATEGORY_FILTER, LEDGER, PAYMENT_RETRIES, REQUESTER_RILEY, STOREFRONT, WEBHOOK_SIGNATURES } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const FEEDBACK_BODY = 'The delay before the first retry should come from the gateway, not from a fixed second.';
const FEEDBACK_SOURCE = 'cockpit';
const NO_DIFF_REQUEST_GRACE_MS = 1_000;
const SETTLED_ISSUE_STATES: readonly string[] = ['pr-open', 'needs-human'];
const BASE_WORDS: Readonly<Record<AcceptanceTestRowView['base'], string>> = { 'red-assertion': 'Red (assertion)', 'red-error': 'Red (error)', green: 'Green', skipped: 'Skipped' };
const BRANCH_WORDS: Readonly<Record<AcceptanceTestRowView['branch'], string>> = { green: 'Green', red: 'Red', skipped: 'Skipped', missing: 'Missing', 'not-run': 'Not run' };
const CHECK_WORDS: Readonly<Record<CheckConclusion, string>> = { success: 'Passed', failure: 'Failed', pending: 'Pending', neutral: 'Neutral', skipped: 'Skipped', cancelled: 'Cancelled' };
const SLIDER_AT_AFTER = '100';
const SLIDER_AT_BEFORE = '0';

type EvidenceOfKind<Kind extends Evidence['kind']> = Extract<Evidence, { kind: Kind }>;

function pullRequestList(page: Page): Locator {
  return page.getByRole('region', { name: 'Pull request list' });
}

function mergeButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Merge', exact: true });
}

function testsWords(count: number, outcome: string): string {
  return `${count} ${count === 1 ? 'test' : 'tests'} ${outcome}`;
}

function mergedAtOf(pullRequest: PullRequestView): string {
  if (pullRequest.mergedAt === null) throw new Error(`pull request #${pullRequest.number} is not merged`);
  return pullRequest.mergedAt;
}

async function openPullRequest(page: Page, factory: RunningFactory, project: string, pullRequest: PullRequestView): Promise<void> {
  await openCockpit(page, factory, paths.pullRequest(project, pullRequest.number));
  await expect(page.getByRole('article').getByRole('heading', { level: 1, name: pullRequest.title })).toBeVisible();
}

async function expectImageCompare(figure: Locator, evidence: EvidenceOfKind<'image-compare'>): Promise<void> {
  await expect(figure.getByRole('img', { name: `${evidence.title} — Before` })).toBeVisible();
  await expect(figure.getByRole('img', { name: `${evidence.title} — After` })).toBeVisible();
  if (evidence.width !== null && evidence.height !== null) await expect(figure).toContainText(`${evidence.width} × ${evidence.height} px`);
  const slider = figure.getByRole('slider', { name: 'Before and after slider' });
  await slider.press('End');
  await expect(slider).toHaveValue(SLIDER_AT_AFTER);
  await expect(slider).toHaveAttribute('aria-valuetext', `${SLIDER_AT_AFTER}% before`);
  await slider.press('Home');
  await expect(slider).toHaveValue(SLIDER_AT_BEFORE);
}

async function expectRedToGreen(figure: Locator, evidence: EvidenceOfKind<'red-green'>): Promise<void> {
  await expect(figure.getByText(evidence.command, { exact: true })).toBeVisible();
  await expect(figure.getByRole('button', { name: 'Copy the command' })).toBeVisible();
  for (const [title, run] of [
    ['Before, on the base', evidence.before],
    ['After, on the branch', evidence.after],
  ] as const) {
    const panel = figure.getByRole('region', { name: title });
    await expect(panel).toContainText(shortSha(run.sha));
    await expect(panel).toContainText(run.outcome === 'passed' ? 'Passed' : 'Failed');
    if (run.summary !== null && run.summary.failed > 0) await expect(panel).toContainText(testsWords(run.summary.failed, 'failed'));
    if (run.summary !== null && run.summary.passed > 0) await expect(panel).toContainText(testsWords(run.summary.passed, 'passed'));
  }
}

async function expectAcceptanceTests(figure: Locator, evidence: EvidenceOfKind<'acceptance-tests'>): Promise<void> {
  const table = figure.getByRole('table', { name: 'Acceptance tests' });
  for (const criterion of evidence.criteria) await expect(table.getByRole('row', { name: new RegExp(`^Criterion ${criterion.criterion} `) })).toBeVisible();
  for (const row of evidence.rows) {
    const line = table.getByRole('row').filter({ hasText: row.name });
    await expect(line).toContainText(BASE_WORDS[row.base]);
    await expect(line).toContainText(BRANCH_WORDS[row.branch]);
  }
  await expect(figure).toContainText('Run with Node test runner');
}

test.describe('the pull requests of the demonstration', () => {
  test('lists the pull requests of a project by state and opens the one the operator picks', async ({ page, factory }) => {
    const state = await factory.api.state();
    const open = pullRequestOfIssue(state, STOREFRONT, issueNamed(state, STOREFRONT, CART_BADGE_TOTAL.spec.title));
    const merged = pullRequestOfIssue(state, STOREFRONT, issueNamed(state, STOREFRONT, CATEGORY_FILTER.spec.title));
    await openCockpit(page, factory, paths.pullRequests(STOREFRONT));
    const list = pullRequestList(page);
    await untilPageAgreesWithFactory(async () => {
      const { pullRequests } = projectOf(await factory.api.state(), STOREFRONT);
      await expect(list.getByRole('heading', { level: 1, name: `Pull requests ${pullRequests.length}` })).toBeVisible(ONE_LOOK);
    });
    const openGroup = list.getByRole('region', { name: 'Open', exact: true });
    const mergedGroup = list.getByRole('region', { name: 'Merged', exact: true });
    await expect(openGroup.getByRole('link', { name: open.title })).toContainText(`#${open.number}`);
    await expect(openGroup.getByRole('link', { name: open.title })).toContainText(`Issue #${open.issueNumber}`);
    await expect(openGroup.getByRole('link', { name: open.title })).toContainText('Ready to merge');
    await expect(mergedGroup.getByRole('link', { name: merged.title })).toContainText(`#${merged.number}`);
    await expect(mergedGroup.getByRole('link', { name: merged.title })).toContainText(`Issue #${merged.issueNumber}`);
    await expect(mergedGroup.getByRole('link', { name: merged.title })).not.toContainText('Ready to merge');
    await expect(openGroup.getByRole('link', { name: merged.title })).toHaveCount(0);

    await mergedGroup.getByRole('link', { name: merged.title }).click();
    await expect(page).toHaveURL(new URL(paths.pullRequest(STOREFRONT, merged.number), factory.origin).href);
    await expect(page.getByRole('article').getByRole('heading', { level: 1, name: merged.title })).toBeVisible();
    await expect(page.getByRole('article')).toContainText(`Merged ${english.dateTime(mergedAtOf(merged))}`);
    await expect(mergeButton(page)).toHaveCount(0);
  });

  test('shows the evidence, the review and the checks of a pull request that waits for the operator', async ({ page, factory }) => {
    const state = await factory.api.until('the checks of the pull request were read', (snapshot) => {
      const candidate = pullRequestOfIssue(snapshot, STOREFRONT, issueNamed(snapshot, STOREFRONT, CART_BADGE_TOTAL.spec.title));
      return candidate.checks.value !== null;
    });
    const issue = issueNamed(state, STOREFRONT, CART_BADGE_TOTAL.spec.title);
    const pullRequest = pullRequestOfIssue(state, STOREFRONT, issue);
    await openPullRequest(page, factory, STOREFRONT, pullRequest);
    const detail = page.getByRole('article');
    await expect(detail).toContainText(`#${pullRequest.number}`);
    await expect(detail).toContainText(pullRequest.branch);
    await expect(detail).toContainText(`Head ${shortSha(pullRequest.headSha)}`);
    await expect(detail.getByRole('link', { name: `Issue #${issue.number}` })).toHaveAttribute('href', paths.issue(STOREFRONT, issue.number));
    await expect(detail.getByRole('link', { name: 'Open on the forge' })).toHaveAttribute('href', pullRequest.url);
    expect((await page.request.get(`${factory.origin}${pullRequest.url}`)).ok(), 'the forge serves the pull request').toBe(true);
    await expect(mergeButton(page)).toBeEnabled();

    const evidence = page.getByRole('region', { name: 'Evidence', exact: true });
    await expect(evidence).toContainText(pullRequest.evidenceComplete ? 'Evidence complete' : 'Evidence incomplete');
    const gallery = evidence.getByRole('group', { name: 'Evidence of the pull request' });
    expect(pullRequest.evidence.map((item) => item.kind)).toEqual(expect.arrayContaining(['image-compare', 'red-green', 'acceptance-tests']));
    for (const item of pullRequest.evidence) {
      const figure = gallery.getByRole('figure', { name: item.title, exact: true });
      await expect(figure).toBeVisible();
      if (item.kind === 'image-compare') await expectImageCompare(figure, item);
      if (item.kind === 'red-green') await expectRedToGreen(figure, item);
      if (item.kind === 'acceptance-tests') await expectAcceptanceTests(figure, item);
    }

    const review = page.getByRole('region', { name: 'Review', exact: true });
    expect(pullRequest.reviewRounds).not.toEqual([]);
    for (const round of pullRequest.reviewRounds) {
      await expect(review).toContainText(`Round ${round.round}`);
      await expect(review.getByRole('link', { name: `Open the review run ${round.runId}` })).toHaveAttribute('href', paths.run(round.runId));
      await expect(review).toContainText(round.findings.length === 0 ? 'No finding' : `${round.findings.length} ${round.findings.length === 1 ? 'finding' : 'findings'}`);
    }

    const checks = page.getByRole('region', { name: 'Checks', exact: true });
    const table = checks.getByRole('table', { name: 'Checks of the head commit' });
    const runs = pullRequest.checks.value;
    if (runs === null) throw new Error(`the checks of pull request #${pullRequest.number} were never read`);
    for (const check of runs) {
      const row = table.getByRole('row', { name: check.name });
      await expect(row).toContainText(CHECK_WORDS[check.conclusion]);
      await expect(row.getByRole('link', { name: `Open the check run ${check.name}` })).toHaveAttribute('href', check.url);
    }
    const firstRun = firstOf(runs, `check run of pull request #${pullRequest.number}`);
    expect((await page.request.get(`${factory.origin}${firstRun.url}`)).ok(), 'the forge serves the log of the check run').toBe(true);
    await untilPageAgreesWithFactory(async () => {
      const { readAt } = pullRequestOf(await factory.api.state(), STOREFRONT, pullRequest.number).checks;
      await expect(checks.getByRole('time')).toHaveAttribute('datetime', readAt ?? '', ONE_LOOK);
    });
  });

  test('tells when the ready notice was sent and links the media the upload command made reachable', async ({ page, factory }) => {
    const state = await factory.api.until(
      'the ready notice of the pull request was sent',
      (snapshot) => pullRequestOfIssue(snapshot, STOREFRONT, issueNamed(snapshot, STOREFRONT, CART_BADGE_TOTAL.spec.title)).readyNotice.status === 'sent',
      { timeoutMs: AGENT_WORK_TIMEOUT_MS },
    );
    const pullRequest = pullRequestOfIssue(state, STOREFRONT, issueNamed(state, STOREFRONT, CART_BADGE_TOTAL.spec.title));
    const { readyNotice } = pullRequest;
    if (readyNotice.status !== 'sent') throw new Error(`the ready notice of pull request #${pullRequest.number} is ${readyNotice.status}`);
    await openPullRequest(page, factory, STOREFRONT, pullRequest);
    const notice = page.getByRole('region', { name: 'Ready notice', exact: true });
    await expect(notice).toContainText(`for head ${shortSha(readyNotice.headSha)}`);
    expect(readyNotice.links.map((link) => link.label)).toEqual(expect.arrayContaining([expect.stringMatching(/ · before · film\.mp4$/), expect.stringMatching(/ · after · film\.mp4$/)]));
    expect(readyNotice.failures, 'every file of the pull request was uploaded').toEqual([]);
    const links = notice.getByRole('list', { name: 'Links in the notice' });
    for (const link of readyNotice.links) {
      expect(link.url.startsWith('file://'), 'the demonstration uploads into a directory of its home').toBe(true);
      await expect(links.getByRole('link', { name: `Open ${link.label}` })).toHaveAttribute('href', link.url);
    }
  });

  test('reads the changes of a pull request only when the operator opens a file', async ({ page, factory }) => {
    const state = await factory.api.state();
    const pullRequest = pullRequestOfIssue(state, STOREFRONT, issueNamed(state, STOREFRONT, CART_BADGE_TOTAL.spec.title));
    const file = firstOf(pullRequest.files, `changed file of pull request #${pullRequest.number}`);
    const diffPath = pullRequestDiffPath(STOREFRONT, pullRequest.number);
    const diffRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === diffPath) diffRequests.push(request.url());
    });
    await openPullRequest(page, factory, STOREFRONT, pullRequest);
    const files = page.getByRole('region', { name: 'Changed files' });
    const fileButtons = files.getByRole('list', { name: 'Changed files' }).getByRole('button');
    await expect(fileButtons).toHaveCount(pullRequest.files.length);
    for (const changed of pullRequest.files) await expect(files.getByRole('button', { name: `Changes of ${changed.path}` })).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(NO_DIFF_REQUEST_GRACE_MS);
    expect(diffRequests, 'nothing is requested before a file is opened').toEqual([]);

    const toggle = files.getByRole('button', { name: `Changes of ${file.path}` });
    const answered = page.waitForResponse((response) => new URL(response.url()).pathname === diffPath);
    await toggle.click();
    expect((await answered).ok(), 'the factory serves the diff').toBe(true);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(files.getByLabel(`Changes in ${file.path}`, { exact: true })).toBeVisible();
    await expect(files.getByRole('link', { name: `View the file at this commit: ${file.path}` })).toHaveAttribute('href', repositoryFilePath(STOREFRONT, pullRequest.headSha, file.path));
    await expect(files.getByRole('time')).toBeVisible();
    expect(diffRequests).toHaveLength(1);

    await files.getByRole('button', { name: 'Show all changes' }).click();
    for (const changed of pullRequest.files) await expect(files.getByLabel(`Changes in ${changed.path}`, { exact: true })).toBeVisible();
    expect(diffRequests, 'the diff already read serves every file').toHaveLength(1);
    await files.getByRole('button', { name: 'Hide all changes' }).click();
    await expect(fileButtons.first()).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    const readAgain = page.waitForResponse((response) => new URL(response.url()).pathname === diffPath);
    await files.getByRole('button', { name: 'Read the changes again' }).click();
    expect((await readAgain).ok()).toBe(true);
    expect(diffRequests).toHaveLength(2);
  });

  test('records the feedback of a reviewer on a pull request and reports what the factory does with it', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    const state = await factory.api.state();
    const issue = issueNamed(state, LEDGER, PAYMENT_RETRIES.spec.title);
    const pullRequest = pullRequestOfIssue(state, LEDGER, issue);
    expect(issue.state).toBe('pr-open');
    expect(pullRequest.externalFeedback).toEqual([]);
    await openPullRequest(page, factory, LEDGER, pullRequest);
    const feedback = page.getByRole('region', { name: 'External feedback' });
    await expect(feedback).toContainText('No external feedback on this pull request.');
    const form = feedback.getByRole('form', { name: 'Send feedback' });
    const author = form.getByRole('textbox', { name: 'Author of the feedback' });
    await expect(author).toHaveValue(state.installation.operator);

    const outcome = await clickCommand(page, 'pr.feedback', async () => {
      await author.fill(REQUESTER_RILEY);
      await form.getByRole('textbox', { name: 'Feedback', exact: true }).fill(FEEDBACK_BODY);
      await form.getByRole('button', { name: 'Send the feedback' }).click();
    });
    const cycleStarted = outcome.effect?.startsWith(`Feedback recorded; issue #${issue.number} starts attempt `) === true;
    if (!cycleStarted) expect(outcome.effect).toMatch(new RegExp(`^Feedback recorded; issue #${issue.number} needs a human: .+`));

    const recorded = pullRequestOf(await factory.api.state(), LEDGER, pullRequest.number).externalFeedback;
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ author: REQUESTER_RILEY, body: FEEDBACK_BODY, source: FEEDBACK_SOURCE, cycleStarted });
    const entry = feedback.getByRole('list', { name: 'External feedback received' }).getByRole('listitem');
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText(REQUESTER_RILEY);
    await expect(entry).toContainText(FEEDBACK_SOURCE);
    await expect(entry).toContainText(FEEDBACK_BODY);
    await expect(entry).toContainText(cycleStarted ? 'Started a new cycle' : 'No new cycle started');

    const settled = await factory.api.until('the factory finished what the feedback started', (snapshot) => SETTLED_ISSUE_STATES.includes(issueOf(snapshot, LEDGER, issue.number).state), {
      timeoutMs: AGENT_WORK_TIMEOUT_MS,
    });
    expect(issueOf(settled, LEDGER, issue.number).state).toBe(cycleStarted ? 'pr-open' : 'needs-human');
    await untilNoAgentIsWorking(factory);
  });

  test('merges a pull request through its dialog, which names the commit it will merge', async ({ page, factory }) => {
    const issue = issueNamed(await factory.api.state(), LEDGER, WEBHOOK_SIGNATURES.spec.title);
    const ready = await factory.api.until('the pull request can be merged', (snapshot) => {
      const pullRequest = pullRequestOfIssue(snapshot, LEDGER, issueOf(snapshot, LEDGER, issue.number));
      return pullRequest.state === 'open' && pullRequest.mergeable;
    });
    const pullRequest = pullRequestOfIssue(ready, LEDGER, issue);
    const { baseBranch } = projectOf(ready, LEDGER);
    await openPullRequest(page, factory, LEDGER, pullRequest);

    await mergeButton(page).click();
    const dialog = page.getByRole('dialog', { name: `Merge #${pullRequest.number}?` });
    await expect(dialog).toContainText(`The factory squash-merges the pull request into ${baseBranch}, only if its head is still the commit shown below.`);
    await expect(dialog).toContainText(pullRequest.title);
    await expect(dialog).toContainText(pullRequest.branch);
    await expect(dialog.getByText(shortSha(pullRequest.headSha), { exact: true })).toBeVisible();
    await expect(dialog).toContainText(pullRequest.evidenceComplete ? 'Evidence complete' : 'Evidence incomplete');
    const outcome = await clickCommand(page, 'pr.merge', async () => {
      await dialog.getByRole('button', { name: `Merge #${pullRequest.number}`, exact: true }).click();
    });
    const mergedAs = new RegExp(`^Pull request #${pullRequest.number} merged as ([0-9a-f]{7})$`).exec(outcome.effect ?? '')?.[1];
    expect(mergedAs, 'the factory names the commit it merged').toBeDefined();

    const merged = await factory.api.until('the pull request and its issue are merged', (snapshot) => pullRequestOf(snapshot, LEDGER, pullRequest.number).state === 'merged');
    expect(issueOf(merged, LEDGER, issue.number).state).toBe('merged');
    const onForge = await page.request.get(`${factory.origin}${forgeFilePath(LEDGER, `pulls/${pullRequest.number}.json`)}`);
    expect(onForge.ok(), `the local forge holds pull request #${pullRequest.number}`).toBe(true);
    const recorded: { state: string; mergeSha: string | null } = await onForge.json();
    expect(recorded.state).toBe('merged');
    expect(recorded.mergeSha?.startsWith(mergedAs ?? '')).toBe(true);

    await expect(dialog).toBeHidden();
    await expect(mergeButton(page)).toHaveCount(0);
    await expect(page.getByRole('article')).toContainText(`Merged ${english.dateTime(mergedAtOf(pullRequestOf(merged, LEDGER, pullRequest.number)))}`);
  });
});
