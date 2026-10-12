import type { Locator, Page } from '@playwright/test';
import type { RunView } from '../../../packages/cockpit/src/contract/index.ts';
import { en } from '../../../packages/cockpit/src/i18n/catalog/en/index.ts';
import { ONE_LOOK, untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { openCockpit } from '../../support/cockpit.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { english } from '../../support/formats.ts';
import { endedRunOf, gatesOf, hooksOf, readRunLog, textsOf, toolCallsOf, toolResultOf, waitingRunOnIssue } from '../../support/run-facts.ts';
import { CART_BADGE_TOTAL, DISCOUNT_ROUNDING, LEDGER, STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const IMPLEMENTER = 'implementer';
const CHALLENGER = 'challenger';
const CART_BADGE_ISSUE = 2;
const DISCOUNT_ISSUE = 3;
const WAITING_TITLE = `Implementer · #${DISCOUNT_ISSUE} ${DISCOUNT_ROUNDING.spec.title}`;
const ENDED_TITLE = `Implementer · #${CART_BADGE_ISSUE} ${CART_BADGE_TOTAL.spec.title}`;
const COPY_FEEDBACK = 'Copied';
const NO_MATCH_QUERY = 'nothing of the kind';

function runList(page: Page): Locator {
  return page.getByRole('region', { name: 'Run list' });
}

function linkToRun(scope: Locator, run: RunView): Locator {
  return scope.locator(`a[href^="/runs/${run.id}"]`);
}

function detailOf(page: Page): Locator {
  return page.getByRole('article');
}

function logOf(page: Page): Locator {
  return page.getByRole('log', { name: 'Run log' });
}

async function openRun(page: Page, factory: RunningFactory, run: RunView): Promise<void> {
  await openCockpit(page, factory, `/runs/${run.id}`);
  await expect(detailOf(page).getByText(run.id, { exact: true })).toBeVisible();
}

test.describe('the runs of the demonstration', () => {
  test('lists the run that waits for an answer under Live and the finished runs under Finished', async ({ page, factory }) => {
    const state = await factory.api.state();
    const waiting = waitingRunOnIssue(state, STOREFRONT, DISCOUNT_ISSUE);
    const ended = endedRunOf(state, STOREFRONT, IMPLEMENTER, CART_BADGE_ISSUE);
    await openCockpit(page, factory, '/runs');
    const list = runList(page);
    await expect(list.getByRole('heading', { level: 1 })).toContainText('Runs');
    const live = list.getByRole('region', { name: 'Live' });
    await expect(linkToRun(live, waiting)).toContainText(WAITING_TITLE);
    await expect(linkToRun(live, waiting)).toContainText('Waiting for an answer');
    await expect(linkToRun(live, waiting).getByRole('img', { name: 'Waiting for an answer' })).toBeVisible();
    const finished = list.getByRole('region', { name: 'Finished' });
    await expect(linkToRun(finished, ended)).toContainText(ENDED_TITLE);
    await expect(linkToRun(finished, ended)).toContainText('Storefront');
    await expect(linkToRun(finished, ended).getByRole('img', { name: 'Succeeded' })).toBeVisible();
    await expect(linkToRun(live, ended)).toHaveCount(0);
  });

  test('says in the list that the dollar figures are API-equivalent prices', async ({ page, factory }) => {
    await openCockpit(page, factory, '/runs');
    const note = runList(page).getByRole('note');
    await expect(note).toContainText('Dollar figures are API-equivalent prices');
    await expect(note).toContainText('The subscription covers this usage: it is not money spent.');
  });

  test('opens a run when the operator picks it in the list', async ({ page, factory }) => {
    const state = await factory.api.state();
    const waiting = waitingRunOnIssue(state, STOREFRONT, DISCOUNT_ISSUE);
    const ended = endedRunOf(state, STOREFRONT, IMPLEMENTER, CART_BADGE_ISSUE);
    await openCockpit(page, factory, '/runs');
    await linkToRun(runList(page), waiting).click();
    await expect(page).toHaveURL(new RegExp(`/runs/${waiting.id}$`));
    await expect(detailOf(page).getByRole('heading', { level: 1 })).toContainText(WAITING_TITLE);
    await expect(linkToRun(runList(page), waiting)).toHaveAttribute('aria-current', 'page');
    await linkToRun(runList(page), ended).click();
    await expect(page).toHaveURL(new RegExp(`/runs/${ended.id}$`));
    await expect(detailOf(page).getByRole('heading', { level: 1 })).toContainText(ENDED_TITLE);
    await expect(linkToRun(runList(page), ended)).toHaveAttribute('aria-current', 'page');
    await expect(linkToRun(runList(page), waiting)).not.toHaveAttribute('aria-current', 'page');
  });

  test('narrows the list to one project and brings every run back with all projects', async ({ page, factory }) => {
    const waiting = waitingRunOnIssue(await factory.api.state(), STOREFRONT, DISCOUNT_ISSUE);
    await openCockpit(page, factory, '/runs');
    const list = runList(page);
    await list.getByRole('combobox', { name: 'Project' }).selectOption({ label: 'Ledger' });
    await expect(page).toHaveURL(/\/runs\?project=ledger/);
    await untilPageAgreesWithFactory(async () => {
      const state = await factory.api.state();
      const ledgerRuns = state.runs.filter((run) => run.project === LEDGER);
      await expect(list.getByRole('status')).toHaveText(`${ledgerRuns.length} of ${state.runs.length} runs`, ONE_LOOK);
      await expect(list.getByRole('link')).toHaveCount(ledgerRuns.length, ONE_LOOK);
      for (const run of ledgerRuns) await expect(linkToRun(list, run)).toHaveCount(1, ONE_LOOK);
    });
    await expect(linkToRun(list, waiting)).toHaveCount(0);
    await list.getByRole('combobox', { name: 'Project' }).selectOption({ label: 'All projects' });
    await expect(page).toHaveURL(/\/runs(\/[0-9a-f-]+)?$/);
    await expect(linkToRun(list, waiting)).toHaveCount(1);
    await untilPageAgreesWithFactory(async () => {
      const state = await factory.api.state();
      await expect(list.getByRole('status')).toHaveText(`${state.runs.length} of ${state.runs.length} runs`, ONE_LOOK);
    });
  });

  test('narrows the list to the runs of a role, says when none matches and clears the filters', async ({ page, factory }) => {
    await openCockpit(page, factory, '/runs');
    const list = runList(page);
    const search = list.getByRole('searchbox', { name: 'Filter the runs' });
    await search.fill(CHALLENGER);
    await untilPageAgreesWithFactory(async () => {
      const state = await factory.api.state();
      const challengerRuns = state.runs.filter((run) => run.role === CHALLENGER);
      await expect(list.getByRole('status')).toHaveText(`${challengerRuns.length} of ${state.runs.length} runs`, ONE_LOOK);
      for (const run of challengerRuns) await expect(linkToRun(list, run)).toHaveCount(1, ONE_LOOK);
    });
    for (const link of await list.getByRole('link').all()) await expect(link).toContainText('Challenger');
    await search.fill(NO_MATCH_QUERY);
    await expect(list.getByText('No run matches these filters')).toBeVisible();
    await expect(list.getByRole('link')).toHaveCount(0);
    await list.getByRole('button', { name: 'Clear the filters' }).click();
    await expect(search).toHaveValue('');
    await expect(list.getByRole('button', { name: 'Clear the filters' })).toHaveCount(0);
    await expect(linkToRun(list, waitingRunOnIssue(await factory.api.state(), STOREFRONT, DISCOUNT_ISSUE))).toHaveCount(1);
  });

  test('shows the question of the run that waits and a field to answer it, without answering', async ({ page, factory }) => {
    const waiting = waitingRunOnIssue(await factory.api.state(), STOREFRONT, DISCOUNT_ISSUE);
    await openRun(page, factory, waiting);
    const detail = detailOf(page);
    await expect(detail.getByText('Waiting for an answer', { exact: true }).first()).toBeVisible();
    await expect(detail.getByText('Decision requested')).toBeVisible();
    const panel = detail.getByRole('region', { name: 'The agent is waiting for your answer' });
    await expect(panel.getByText(waiting.pendingQuestion.text.replace(/\s+/g, ' ').trim(), { exact: true })).toBeVisible();
    await expect(panel.getByRole('textbox', { name: 'Your answer' })).toHaveValue('');
    await expect(panel.getByRole('textbox', { name: 'Your answer' })).toHaveAttribute('placeholder', 'Or write your own answer…');
    await expect(panel.getByRole('button', { name: 'Send the answer' })).toBeDisabled();
    await expect(detail.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Resume' })).toHaveCount(0);
    const after = waitingRunOnIssue(await factory.api.state(), STOREFRONT, DISCOUNT_ISSUE);
    expect(after.id).toBe(waiting.id);
    expect(after.pendingQuestion.id).toBe(waiting.pendingQuestion.id);
  });

  test('follows the log of the run that waits until the operator stops following it', async ({ page, factory }) => {
    await openRun(page, factory, waitingRunOnIssue(await factory.api.state(), STOREFRONT, DISCOUNT_ISSUE));
    const follow = detailOf(page).getByRole('button', { name: 'Follow' });
    await expect(follow).toHaveAttribute('aria-pressed', 'true');
    await follow.click();
    await expect(follow).toHaveAttribute('aria-pressed', 'false');
    await follow.click();
    await expect(follow).toHaveAttribute('aria-pressed', 'true');
  });

  test('shows who ran a finished run, on what, and what it used', async ({ page, factory }) => {
    const ended = endedRunOf(await factory.api.state(), STOREFRONT, IMPLEMENTER, CART_BADGE_ISSUE);
    await openRun(page, factory, ended);
    const detail = detailOf(page);
    await expect(detail.getByText('Succeeded', { exact: true }).first()).toBeVisible();
    await expect(detail.getByText('Success', { exact: true })).toBeVisible();
    await expect(detail.getByText(ended.id, { exact: true })).toBeVisible();
    await expect(detail.getByRole('link', { name: `#${CART_BADGE_ISSUE}` })).toHaveAttribute('href', `/projects/${STOREFRONT}/issues/${CART_BADGE_ISSUE}`);
    await expect(detail.getByRole('link', { name: 'Storefront' })).toHaveAttribute('href', `/projects/${STOREFRONT}`);
    await expect(detail).toContainText(ended.model);
    await expect(detail).toContainText(`Effort: ${en[`vocab.effort.${ended.effort}`]}`);
    await expect(detail).toContainText(`Attempt ${ended.attempt + 1}`);
    await expect(detail).toContainText(ended.branch ?? '');
    const figures = detail.getByRole('group', { name: 'Run figures' });
    await expect(figures).toContainText(`${ended.turns} of ${ended.maxTurns}`);
    await expect(figures).toContainText(english.usd(ended.costUsd));
    await expect(figures).toContainText('API-equivalent');
    const { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens } = ended.usage;
    await expect(figures).toContainText(`${english.compact(inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens)} tokens including cache`);
    await expect(figures).toContainText(`${english.compact(inputTokens + outputTokens)} tokens excluding cache`);
    await expect(figures).toContainText('No tool in use');
    await expect(figures).toContainText('No subagent');
    await expect(detail.getByRole('button', { name: 'Stop' })).toHaveCount(0);
    await expect(detail.getByRole('region', { name: 'The agent is waiting for your answer' })).toHaveCount(0);
  });

  test('copies the identifier of a run', async ({ page, factory, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: factory.origin });
    const ended = endedRunOf(await factory.api.state(), STOREFRONT, IMPLEMENTER, CART_BADGE_ISSUE);
    await openRun(page, factory, ended);
    await detailOf(page).getByRole('button', { name: 'Copy the identifier' }).click();
    await expect(detailOf(page).getByRole('button', { name: COPY_FEEDBACK })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ended.id);
  });

  test('counts the lines of the log of a finished run in its tab and next to its filters', async ({ page, factory }) => {
    const ended = endedRunOf(await factory.api.state(), STOREFRONT, IMPLEMENTER, CART_BADGE_ISSUE);
    const log = await readRunLog(factory, ended.id);
    await openRun(page, factory, ended);
    const tabs = detailOf(page).getByRole('tablist', { name: 'Sections of the run' });
    await expect(tabs.getByRole('tab', { name: `Log ${log.total}` })).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.getByRole('tab', { name: 'Subagents 0' })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Gate' })).toBeVisible();
    await expect(detailOf(page).getByText(`${log.total} lines`)).toBeVisible();
    const filters = detailOf(page).getByRole('radiogroup', { name: 'Filter the log' });
    await expect(filters.getByRole('radio', { name: /^All \d+$/ })).toBeChecked();
    for (const name of ['Text', 'Tools', 'Hooks and gate', 'Errors', 'Noise']) await expect(filters.getByRole('radio', { name: new RegExp(`^${name} \\d+$`) })).not.toBeChecked();
  });

  test('lists the tool calls of a finished run and opens one on its input and its result', async ({ page, factory }) => {
    const ended = endedRunOf(await factory.api.state(), STOREFRONT, IMPLEMENTER, CART_BADGE_ISSUE);
    const log = await readRunLog(factory, ended.id);
    const calls = toolCallsOf(log);
    const first = calls[0];
    if (first === undefined) throw new Error('the finished run made no tool call');
    await openRun(page, factory, ended);
    await detailOf(page).getByRole('radio', { name: `Tools ${calls.length}` }).click();
    const rows = logOf(page).getByRole('button', { expanded: false });
    await expect(rows).toHaveCount(calls.length);
    await expect(rows.first()).toContainText(first.toolName);
    await rows.first().click();
    await expect(logOf(page).getByRole('button', { expanded: true })).toHaveCount(1);
    await expect(logOf(page).getByText('Input', { exact: true })).toBeVisible();
    await expect(logOf(page).getByText('Result', { exact: true })).toBeVisible();
    await expect(logOf(page).locator('pre').first()).toHaveText(JSON.stringify(first.input, null, 2));
    await expect(logOf(page).locator('pre').nth(1)).toHaveText(toolResultOf(log, first)?.content ?? '');
    await logOf(page).getByRole('button', { expanded: true }).click();
    await expect(logOf(page).getByText('Input', { exact: true })).toHaveCount(0);
  });

  test('lists what the agent wrote under Text', async ({ page, factory }) => {
    const ended = endedRunOf(await factory.api.state(), STOREFRONT, IMPLEMENTER, CART_BADGE_ISSUE);
    const texts = textsOf(await readRunLog(factory, ended.id));
    await openRun(page, factory, ended);
    await detailOf(page).getByRole('radio', { name: `Text ${texts.length}` }).click();
    for (const text of texts) await expect(logOf(page).getByText(text, { exact: true })).toBeVisible();
    await expect(logOf(page).getByRole('button', { expanded: false })).toHaveCount(0);
    await expect(logOf(page).getByText(/^Hook /)).toHaveCount(0);
  });

  test('lists the hooks the agent went through under Hooks and gate, with their exit code and what they printed', async ({ page, factory }) => {
    const ended = endedRunOf(await factory.api.state(), STOREFRONT, IMPLEMENTER, CART_BADGE_ISSUE);
    const hooks = hooksOf(await readRunLog(factory, ended.id));
    expect(hooks.length).toBeGreaterThan(0);
    await openRun(page, factory, ended);
    await detailOf(page).getByRole('radio', { name: /^Hooks and gate \d+$/ }).click();
    for (const event of new Set(hooks.map((hook) => hook.hookEvent))) {
      const expected = hooks.filter((hook) => hook.hookEvent === event);
      await expect(logOf(page).getByText(`Hook ${event}`, { exact: true })).toHaveCount(expected.length);
    }
    await expect(logOf(page).getByText('exit code 0')).toHaveCount(hooks.filter((hook) => hook.exitCode === 0).length);
    await expect(logOf(page).getByText('Succeeded', { exact: true })).toHaveCount(hooks.filter((hook) => hook.exitCode === 0).length);
    for (const printed of hooks.filter((hook) => hook.output.trim().length > 0)) {
      await expect(logOf(page).getByText(printed.output.replace(/\s+/g, ' ').trim(), { exact: true })).toBeVisible();
    }
  });

  test('searches the log and says when no line matches', async ({ page, factory }) => {
    const ended = endedRunOf(await factory.api.state(), STOREFRONT, IMPLEMENTER, CART_BADGE_ISSUE);
    const texts = textsOf(await readRunLog(factory, ended.id));
    const firstText = texts[0];
    if (firstText === undefined) throw new Error('the finished run wrote no text');
    await openRun(page, factory, ended);
    const search = detailOf(page).getByRole('searchbox', { name: 'Search the log' });
    await search.fill(firstText.slice(0, firstText.indexOf(' ', 20)));
    await expect(logOf(page).getByText(firstText, { exact: true })).toBeVisible();
    await expect(logOf(page).getByRole('button', { expanded: false })).toHaveCount(0);
    await search.fill(NO_MATCH_QUERY);
    await expect(detailOf(page).getByText('No line matches')).toBeVisible();
    await search.fill('');
    await expect(logOf(page).getByText(firstText, { exact: true })).toBeVisible();
  });

  test('switches the raw view of the system rows on and off', async ({ page, factory }) => {
    const ended = endedRunOf(await factory.api.state(), STOREFRONT, IMPLEMENTER, CART_BADGE_ISSUE);
    await openRun(page, factory, ended);
    const raw = detailOf(page).getByRole('button', { name: 'Raw' });
    await expect(raw).toHaveAttribute('aria-pressed', 'false');
    await raw.click();
    await expect(raw).toHaveAttribute('aria-pressed', 'true');
    await raw.click();
    await expect(raw).toHaveAttribute('aria-pressed', 'false');
  });

  test('says that a run started no subagent', async ({ page, factory }) => {
    const ended = endedRunOf(await factory.api.state(), STOREFRONT, IMPLEMENTER, CART_BADGE_ISSUE);
    await openRun(page, factory, ended);
    await detailOf(page).getByRole('tab', { name: 'Subagents 0' }).click();
    await expect(detailOf(page).getByText('No subagent', { exact: true }).first()).toBeVisible();
    await expect(detailOf(page).getByText('Subagents started by the agent appear here with their tool calls.')).toBeVisible();
  });

  test('says that the gate has not run for a run that never went through it', async ({ page, factory }) => {
    const challenge = (await factory.api.state()).runs.find((run) => run.role === CHALLENGER);
    if (challenge === undefined) throw new Error('the demonstration holds no challenger run');
    const log = await readRunLog(factory, challenge.id);
    expect(gatesOf(log)).toEqual([]);
    expect(hooksOf(log)).toEqual([]);
    await openRun(page, factory, challenge);
    await detailOf(page).getByRole('tab', { name: 'Gate' }).click();
    await expect(detailOf(page).getByText('The gate has not run yet')).toBeVisible();
    await expect(detailOf(page).getByText('The Stop hook runs the deterministic gate before the agent may finish.')).toBeVisible();
    await expect(detailOf(page).getByRole('list', { name: 'Gate passes' })).toHaveCount(0);
  });
});
