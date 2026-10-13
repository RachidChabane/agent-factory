import type { Locator, Page } from '@playwright/test';
import { formatArrival } from '../../../packages/application/src/film/film-time.ts';
import {
  forgeFilePath,
  pullRequestDiffPath,
  repositoryFilePath,
  PENDING_FILM_STATES,
  type AcceptanceTestRowView,
  type CheckConclusion,
  type CockpitSnapshot,
  type Evidence,
  type FilmPhaseView,
  type FilmView,
  type PullRequestView,
} from '../../../packages/cockpit/src/contract/index.ts';
import { FILM_SCENARIO_MAX_LENGTH } from '../../../packages/domain/src/index.ts';
import { shortSha } from '../../../packages/cockpit/src/model/identifiers.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { ONE_LOOK, untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { issueOf, projectOf, pullRequestOf } from '../../support/api.ts';
import { followSnapshots, openCockpit, pullRequestDetail, recordCommandsSent, type SnapshotTrail } from '../../support/cockpit.ts';
import { clickCommand, type ClickOptions, type CommandOutcome } from '../../support/commands.ts';
import { AGENT_WORK_TEST_TIMEOUT_MS, AGENT_WORK_TIMEOUT_MS, untilNoAgentIsWorking } from '../../support/factory-activity.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { factValue, literally } from '../../support/facts.ts';
import { english } from '../../support/formats.ts';
import { isLater } from '../../support/instants.ts';
import { firstOf, issueNamed, pullRequestOfIssue } from '../../support/project-facts.ts';
import { pauseScheduler, resumeScheduler } from '../../support/scenes.ts';
import {
  CART_BADGE_TOTAL,
  CATEGORY_FILTER,
  CHECKOUT_FLOW_SCENARIO,
  LEDGER,
  PAYMENT_RETRIES,
  REQUESTER_RILEY,
  SKIPPED_REASON,
  STOREFRONT,
  UNAVAILABLE_SCENARIO,
  WEBHOOK_SIGNATURES,
} from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';
import { wordsIn } from '../../support/words.ts';

const FEEDBACK_BODY = 'The delay before the first retry should come from the gateway, not from a fixed second.';
const FEEDBACK_SOURCE = 'cockpit';
const NO_DIFF_REQUEST_GRACE_MS = 1_000;
const SETTLED_ISSUE_STATES: readonly string[] = ['pr-open', 'needs-human'];
const BASE_WORDS: Readonly<Record<AcceptanceTestRowView['base'], string>> = { 'red-assertion': 'Red (assertion)', 'red-error': 'Red (error)', green: 'Green', skipped: 'Skipped' };
const BRANCH_WORDS: Readonly<Record<AcceptanceTestRowView['branch'], string>> = { green: 'Green', red: 'Red', skipped: 'Skipped', missing: 'Missing', 'not-run': 'Not run' };
const CHECK_WORDS: Readonly<Record<CheckConclusion, string>> = { success: 'Passed', failure: 'Failed', pending: 'Pending', neutral: 'Neutral', skipped: 'Skipped', cancelled: 'Cancelled' };
const SLIDER_AT_AFTER = '100';
const SLIDER_AT_BEFORE = '0';
const NOT_A_SCENARIO = 'bad name';
/** A scenario the spec of the pull request does not declare: recording it adds a commit to the branch, so the pull request gets a new head. */
const GUEST_CHECKOUT_SCENARIO = 'guest-checkout';
const FILMS_IN_PROGRESS = 'films in progress';
const MP4_CONTENT_TYPE = 'video/mp4';
const IMAGE_CONTENT_TYPE_PREFIX = 'image/';
const FILM_PHASES = { before: 'Before', after: 'After' } as const;

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
  await expect(pullRequestDetail(page, pullRequest.title)).toBeVisible();
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
    await expect(pullRequestDetail(page, merged.title)).toBeVisible();
    await expect(pullRequestDetail(page, merged.title)).toContainText(`Merged ${english.dateTime(mergedAtOf(merged))}`);
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
    const detail = pullRequestDetail(page, pullRequest.title);
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
    await expect(notice.getByRole('time')).toHaveAttribute('datetime', readyNotice.sentAt);
    await expect(notice.getByRole('time')).toHaveAttribute('title', english.absolute(readyNotice.sentAt));
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
    await expect(pullRequestDetail(page, pullRequest.title)).toContainText(`Merged ${english.dateTime(mergedAtOf(pullRequestOf(merged, LEDGER, pullRequest.number)))}`);
  });
});

function cartBadgePullRequest(state: CockpitSnapshot): PullRequestView {
  return pullRequestOfIssue(state, STOREFRONT, issueNamed(state, STOREFRONT, CART_BADGE_TOTAL.spec.title));
}

function filmsRegion(page: Page): Locator {
  return page.getByRole('region', { name: 'Videos', exact: true });
}

function filmOrderForm(page: Page, pullRequest: PullRequestView): Locator {
  return page.getByRole('dialog', { name: `Film pull request #${pullRequest.number}` });
}

function recordedFilm(pullRequest: PullRequestView, scenario: string): FilmView {
  const film = pullRequest.films.find((candidate) => candidate.scenario === scenario);
  if (film === undefined) throw new Error(`pull request #${pullRequest.number} holds no film of scenario ${scenario}`);
  return film;
}

function filmTimeZoneOf(state: CockpitSnapshot): string {
  const timeZone = projectOf(state, STOREFRONT).settings.films?.timeZone;
  if (timeZone === undefined) throw new Error('the storefront films nothing');
  return timeZone;
}

function isPending(state: PullRequestView['filmOrders'][number]['state']): boolean {
  return PENDING_FILM_STATES.includes(state);
}

/** Fills the form of the Film button with the scenario and sends it. */
function orderFilm(page: Page, pullRequest: PullRequestView, scenario: string, options: ClickOptions = {}): Promise<CommandOutcome> {
  return clickCommand(
    page,
    'pr.film',
    async () => {
      await filmsRegion(page).getByRole('button', { name: 'Film', exact: true }).click();
      const form = filmOrderForm(page, pullRequest);
      await form.getByRole('textbox', { name: 'Scenario name' }).fill(scenario);
      await form.getByRole('button', { name: 'Order the film' }).click();
    },
    options,
  );
}

/** What the page says of the films that wait in the queue and of the merge they hold, compared with the snapshot the page holds. */
async function expectQueueShown(page: Page, received: SnapshotTrail, scenarios: readonly string[]): Promise<void> {
  await untilPageAgreesWithFactory(async () => {
    const state = received.latest();
    const pullRequest = cartBadgePullRequest(state);
    const pending = pullRequest.filmOrders.filter((order) => isPending(order.state));
    expect(
      pending.map((order) => [order.scenario, order.state]),
      'the films wait in the order they were ordered',
    ).toEqual(scenarios.map((scenario) => [scenario, 'queued']));
    const films = filmsRegion(page);
    for (const order of pending) {
      const queued = films.getByRole('region', { name: `Film of scenario ${order.scenario}`, exact: true });
      await expect(queued).toContainText(`Queued · scenario ${order.scenario}`, ONE_LOOK);
      await expect(queued).toContainText('Ordered by Alex Morgan.', ONE_LOOK);
      await expect(queued.getByRole('time')).toHaveAttribute('datetime', order.since, ONE_LOOK);
      await expect(queued.getByRole('time')).toHaveAttribute('title', english.absolute(order.since), ONE_LOOK);
      if (order.filmsAhead === 0) await expect(queued).not.toContainText('ahead of this one', ONE_LOOK);
      else await expect(queued).toContainText(`${order.filmsAhead} ${order.filmsAhead === 1 ? 'film' : 'films'} ahead of this one.`, ONE_LOOK);
      if (order.expectedAt === null) throw new Error(`the factory gives no arrival for the queued film of ${order.scenario}`);
      await expect(queued).toContainText(`Expected around ${english.dateTimeIn(order.expectedAt, filmTimeZoneOf(state))}.`, ONE_LOOK);
    }
    await expect(films.getByText(/^Read /)).toHaveAttribute('datetime', state.generatedAt, ONE_LOOK);

    const latest = pending.map((order) => order.expectedAt ?? '').toSorted().at(-1) ?? '';
    const reason = `${FILMS_IN_PROGRESS}, expected around ${formatArrival(new Date(latest), filmTimeZoneOf(state))}`;
    expect(pullRequest.mergeBlockers, 'the factory holds the merge until the last film is expected').toContain(reason);
    await expect(mergeButton(page)).toBeDisabled(ONE_LOOK);
    await expect(mergeButton(page)).toHaveAccessibleDescription(new RegExp(literally(reason)), ONE_LOOK);
    await expect(page.getByRole('region', { name: 'Not mergeable yet', exact: true }).getByRole('list', { name: 'Merge blockers' }).getByRole('listitem')).toHaveText(pullRequest.mergeBlockers, ONE_LOOK);
  });
}

async function expectFilmPhase(page: Page, factory: RunningFactory, card: Locator, title: string, phase: FilmPhaseView, scenario: string): Promise<void> {
  const section = card.getByRole('region', { name: title, exact: true });
  await expect(section).toContainText(shortSha(phase.sha));
  await expect(section.getByLabel(`${title} recording, scenario ${scenario}`)).toHaveAttribute('src', phase.videoUrl);
  const video = await page.request.get(`${factory.origin}${phase.videoUrl}`);
  expect(video.status(), `the factory serves ${phase.videoUrl}`).toBe(200);
  expect(video.headers()['content-type']).toBe(MP4_CONTENT_TYPE);
  expect(phase.screenshotUrls, 'the final screenshot and the key frames of the recording').not.toEqual([]);
  for (const [position, url] of phase.screenshotUrls.entries()) {
    const image = section.getByRole('img', { name: `${title}, scenario ${scenario}, screenshot ${position + 1}` });
    await expect(image).toHaveAttribute('src', url);
    const frame = await page.request.get(`${factory.origin}${url}`);
    expect(frame.status(), `the factory serves ${url}`).toBe(200);
    expect(frame.headers()['content-type']).toContain(IMAGE_CONTENT_TYPE_PREFIX);
  }
  expect(phase.facts, 'the facts the report of the recording gave').not.toEqual([]);
  const facts = section.getByLabel(`Facts of the ${title} recording`);
  for (const fact of phase.facts) await expect(factValue(facts, fact.label)).toHaveText(fact.value);
}

test.describe('the films of a pull request that declares them', () => {
  test.describe.configure({ mode: 'serial' });
  const words = wordsIn('en');
  let recordedBefore = '';
  let headBefore = '';

  test('offers the Film button and a form for the name of a scenario, and refuses a name that is not one', async ({ page, factory }) => {
    const pullRequest = cartBadgePullRequest(await factory.api.state());
    const sent = recordCommandsSent(page);
    await openPullRequest(page, factory, STOREFRONT, pullRequest);
    const films = filmsRegion(page);
    await expect(films).toContainText(words.t('pullRequests.films.description'));
    await films.getByRole('button', { name: 'Film', exact: true }).click();
    const form = filmOrderForm(page, pullRequest);
    const rule = words.t('pullRequests.films.order.rule', { max: FILM_SCENARIO_MAX_LENGTH });
    await expect(form).toContainText(words.t('pullRequests.films.order.description'));
    await expect(form).toContainText(rule);
    await form.getByRole('textbox', { name: 'Scenario name' }).fill(NOT_A_SCENARIO);
    await form.getByRole('button', { name: 'Order the film' }).click();
    await expect(form.getByText(words.t('pullRequests.films.order.error', { rule }))).toBeVisible();
    expect(sent, 'a name that is no scenario sends nothing').toEqual([]);
    await form.getByRole('button', { name: 'Cancel' }).click();
    await expect(form).toBeHidden();
    expect(sent).toEqual([]);
  });

  test('offers no Film button on a pull request of a project that films nothing', async ({ page, factory }) => {
    const state = await factory.api.state();
    expect(projectOf(state, LEDGER).settings.films).toBeNull();
    const pullRequest = pullRequestOfIssue(state, LEDGER, issueNamed(state, LEDGER, PAYMENT_RETRIES.spec.title));
    expect(pullRequest.state).toBe('open');
    await openPullRequest(page, factory, LEDGER, pullRequest);
    await expect(filmsRegion(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Film', exact: true })).toHaveCount(0);
  });

  test('queues the films ordered from the form in the order they were ordered, refuses a scenario already queued and holds the merge until the last one is expected', async ({ page, factory }) => {
    const pullRequest = cartBadgePullRequest(await factory.api.state());
    recordedBefore = recordedFilm(pullRequest, CHECKOUT_FLOW_SCENARIO).recordedAt;
    headBefore = pullRequest.headSha;
    const received = followSnapshots(page);
    await openPullRequest(page, factory, STOREFRONT, pullRequest);
    await expect(mergeButton(page)).toBeEnabled();
    await pauseScheduler(factory);
    try {
      const queued = await orderFilm(page, pullRequest, CHECKOUT_FLOW_SCENARIO);
      expect(queued.effect).toBe(`The film of scenario ${CHECKOUT_FLOW_SCENARIO} is queued for issue #${pullRequest.issueNumber} of ${STOREFRONT}; the daemon picks it up at its next tick`);

      const refused = await orderFilm(page, pullRequest, CHECKOUT_FLOW_SCENARIO, { status: 409 });
      expect(refused.error).toBe(`Issue #${pullRequest.issueNumber} cannot be filmed: the film of scenario ${CHECKOUT_FLOW_SCENARIO} is already queued`);
      await expect(filmOrderForm(page, pullRequest)).toBeVisible();
      await filmOrderForm(page, pullRequest).getByRole('button', { name: 'Cancel' }).click();

      await orderFilm(page, pullRequest, GUEST_CHECKOUT_SCENARIO);
      await orderFilm(page, pullRequest, UNAVAILABLE_SCENARIO);
      await expectQueueShown(page, received, [CHECKOUT_FLOW_SCENARIO, GUEST_CHECKOUT_SCENARIO, UNAVAILABLE_SCENARIO]);
    } finally {
      await resumeScheduler(factory);
    }
  });

  test('plays the scenario recorded again, on the base and on the head, with its facts, its key frames and the time it was recorded', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    const state = await factory.api.until('the films of the pull request were recorded or failed', (snapshot) => cartBadgePullRequest(snapshot).filmOrders.every((order) => !isPending(order.state)), {
      timeoutMs: AGENT_WORK_TIMEOUT_MS,
    });
    const pullRequest = cartBadgePullRequest(state);
    const film = recordedFilm(pullRequest, CHECKOUT_FLOW_SCENARIO);
    expect(isLater(film.recordedAt, recordedBefore), 'the click recorded the scenario again').toBe(true);
    expect(pullRequest.headSha, 'a scenario nobody recorded yet adds a commit to the branch').not.toBe(headBefore);
    expect(pullRequest.films.map((candidate) => candidate.scenario).toSorted()).toEqual([CHECKOUT_FLOW_SCENARIO, GUEST_CHECKOUT_SCENARIO].toSorted());

    await openPullRequest(page, factory, STOREFRONT, pullRequest);
    for (const recorded of pullRequest.films) {
      const card = filmsRegion(page).getByRole('article', { name: `Scenario ${recorded.scenario}`, exact: true });
      await expect(card.getByRole('heading', { name: recorded.scenario, exact: true })).toBeVisible();
      await expect(card.getByRole('time')).toHaveAttribute('datetime', recorded.recordedAt);
      await expect(card.getByRole('time')).toHaveAttribute('title', english.absolute(recorded.recordedAt));
      await expectFilmPhase(page, factory, card, FILM_PHASES.before, recorded.before, recorded.scenario);
      await expectFilmPhase(page, factory, card, FILM_PHASES.after, recorded.after, recorded.scenario);
    }
  });

  test('tells why a film failed, lets the merge go on, and says why the ready notice of the new head is held', async ({ page, factory }) => {
    const state = await factory.api.until('the film of the unavailable scenario failed', (snapshot) => cartBadgePullRequest(snapshot).filmOrders.some((order) => order.scenario === UNAVAILABLE_SCENARIO && order.state === 'failed'), {
      timeoutMs: AGENT_WORK_TIMEOUT_MS,
    });
    const pullRequest = cartBadgePullRequest(state);
    const failed = pullRequest.filmOrders.find((order) => order.scenario === UNAVAILABLE_SCENARIO);
    if (failed === undefined) throw new Error(`no film of ${UNAVAILABLE_SCENARIO} was ordered`);
    expect(failed.reason).toContain(SKIPPED_REASON);
    expect(pullRequest.mergeBlockers.filter((blocker) => blocker.startsWith(FILMS_IN_PROGRESS)), 'a failed film does not hold the merge').toEqual([]);
    expect(pullRequest.readyNotice.status).toBe('held');

    await openPullRequest(page, factory, STOREFRONT, pullRequest);
    const alert = filmsRegion(page).getByRole('region', { name: `Failed film of scenario ${UNAVAILABLE_SCENARIO}`, exact: true });
    await expect(alert).toContainText(`The film of scenario ${UNAVAILABLE_SCENARIO} failed`);
    await expect(alert).toContainText(failed.reason ?? '');
    await expect(alert.getByRole('time')).toHaveAttribute('datetime', failed.since);
    await expect(alert.getByRole('time')).toHaveAttribute('title', english.absolute(failed.since));
    await expect(filmsRegion(page).getByRole('article', { name: `Scenario ${UNAVAILABLE_SCENARIO}` })).toHaveCount(0);

    const notice = page.getByRole('region', { name: 'Ready notice', exact: true });
    await expect(notice).toContainText('Not sent yet');
    await expect(notice.getByRole('list', { name: 'What holds the notice' })).toContainText(`The film of scenario ${UNAVAILABLE_SCENARIO} failed: order it again, or merge without it.`);
    await untilPageAgreesWithFactory(async () => {
      const held = cartBadgePullRequest(await factory.api.state()).readyNotice;
      if (held.status !== 'held') throw new Error(`the ready notice is ${held.status}, not held`);
      await expect(notice.getByRole('time')).toHaveAttribute('datetime', held.checksReadAt ?? '', ONE_LOOK);
    });
  });
});
