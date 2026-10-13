import type { Locator, Page } from '@playwright/test';
import type { WorktreeShortageView } from '../../../packages/cockpit/src/contract/index.ts';
import type { I18n } from '../../../packages/cockpit/src/i18n/create-i18n.ts';
import type { Locale } from '../../../packages/cockpit/src/i18n/locale.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { issueOf, projectOf } from '../../support/api.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { AGENT_WORK_TEST_TIMEOUT_MS } from '../../support/factory-activity.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { LEDGER_POOL_SIZE } from '../../support/rehearsal-layout.ts';
import { LEDGER_REQUESTS } from '../../support/rehearsal-scenario.ts';
import { acceptSpec, receiveChallengedRequest, settled, untilPullRequestIsOpen } from '../../support/scenes.ts';
import { LEDGER } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';
import { wordsIn } from '../../support/words.ts';

const LEDGER_NAME = 'Ledger';
const FRENCH = 'Français';
const FRENCH_LOCALE: Locale = 'fr';

/** The two issues that fill the ledger's only worktree: the one whose open pull request holds it, and the one that waits for it. */
interface Scene {
  readonly holder: number;
  readonly pullRequest: number;
  readonly waiting: number;
}

let scene: Scene | null = null;

function sceneOrFail(): Scene {
  if (scene === null) throw new Error('the scene of the worktree shortage was never built');
  return scene;
}

async function fillTheOnlyWorktree(factory: RunningFactory): Promise<Scene> {
  await settled(factory);
  const holderRequest = await receiveChallengedRequest(factory, LEDGER_REQUESTS.holder.request, LEDGER);
  const holder = await acceptSpec(factory, holderRequest, LEDGER_REQUESTS.holder.spec.title, true, LEDGER);
  const opened = await untilPullRequestIsOpen(factory, holder, LEDGER);
  const pullRequest = issueOf(opened, LEDGER, holder).pullRequestNumber;
  if (pullRequest === null) throw new Error(`issue #${holder} of the ledger has no pull request`);
  const waitingRequest = await receiveChallengedRequest(factory, LEDGER_REQUESTS.waiting.request, LEDGER);
  const waiting = await acceptSpec(factory, waitingRequest, LEDGER_REQUESTS.waiting.spec.title, true, LEDGER);
  await factory.api.until(`issue #${waiting} to wait for a worktree`, (state) => projectOf(state, LEDGER).scheduler.worktreeShortage?.waiting.includes(waiting) === true);
  return { holder, pullRequest, waiting };
}

async function shortageOf(factory: RunningFactory): Promise<WorktreeShortageView> {
  const shortage = projectOf(await factory.api.state(), LEDGER).scheduler.worktreeShortage;
  if (shortage === null) throw new Error('the ledger reports no worktree shortage');
  return shortage;
}

/** What the part of a page that tells the scheduling of the ledger says of its only worktree, in the words of a language. */
async function expectShortageTold(scope: Locator, words: I18n): Promise<void> {
  const { holder, pullRequest, waiting } = sceneOrFail();
  const wording = { waiting: words.t('pause.worktrees.waiting', { count: 1 }), held: words.t('pause.worktrees.held', { count: LEDGER_POOL_SIZE }) };
  await expect(scope.getByText(words.t('pause.worktrees.state'), { exact: true })).toBeVisible();
  await expect(scope.getByText(words.t('pause.worktrees.badge'), { exact: true })).toBeVisible();
  await expect(scope).toContainText(wording.waiting);
  await expect(scope.getByRole('link', { name: `#${waiting}`, exact: true })).toHaveAttribute('href', paths.issue(LEDGER, waiting));
  await expect(scope).toContainText(wording.held);
  const holders = scope.getByRole('list', { name: words.t('pause.worktrees.holders') });
  const row = holders.getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('link', { name: words.t('board.card.issue', { number: holder }) })).toHaveAttribute('href', paths.issue(LEDGER, holder));
  await expect(row.getByRole('link', { name: words.t('pause.worktrees.pullRequest', { number: pullRequest }) })).toHaveAttribute('href', paths.pullRequest(LEDGER, pullRequest));
  await expect(row).toContainText(words.t('vocab.issueState.pr-open'));
  await expect(scope).toContainText(words.t('pause.worktrees.remedy'));
}

async function expectConditionDated(scope: Locator, shortage: WorktreeShortageView): Promise<void> {
  await expect(scope.getByRole('time')).toHaveAttribute('datetime', shortage.since);
}

function boardScope(page: Page): Locator {
  return page.getByRole('region', { name: LEDGER_NAME, exact: true });
}

function overviewScope(page: Page, words: I18n): Locator {
  return page.getByRole('region', { name: words.t('pause.projectHeading'), exact: true });
}

async function switchToFrench(page: Page): Promise<void> {
  await page.getByRole('radio', { name: FRENCH }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', FRENCH_LOCALE);
}

test.describe('a project whose worktrees are all held, in a rehearsal', () => {
  test.describe.configure({ mode: 'serial' });
  const english = wordsIn('en');
  const french = wordsIn('fr');

  test('tells on the board which pull request holds the only worktree and which issue waits for it', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    scene = await fillTheOnlyWorktree(factory);
    const shortage = await shortageOf(factory);
    expect(shortage).toMatchObject({
      poolSize: LEDGER_POOL_SIZE,
      waiting: [scene.waiting],
      holders: [{ issueNumber: scene.holder, state: 'pr-open', pullRequestNumber: scene.pullRequest }],
    });
    await openCockpit(page, factory, paths.board());
    await expectShortageTold(boardScope(page), english);
    await expectConditionDated(boardScope(page), shortage);
  });

  test('tells it on the overview of the project too', async ({ page, factory }) => {
    const shortage = await shortageOf(factory);
    await openCockpit(page, factory, paths.project(LEDGER));
    await expectShortageTold(overviewScope(page, english), english);
    await expectConditionDated(overviewScope(page, english), shortage);
  });

  test('tells it in French once the operator switches the language', async ({ page, factory }) => {
    const shortage = await shortageOf(factory);
    await openCockpit(page, factory, paths.board());
    await switchToFrench(page);
    await expectShortageTold(boardScope(page), french);
    await expectConditionDated(boardScope(page), shortage);
    await openCockpit(page, factory, paths.project(LEDGER), FRENCH_LOCALE);
    await expectShortageTold(overviewScope(page, french), french);
  });

  test('stops telling it once the waiting issue is paused, since it no longer waits for a worktree', async ({ page, factory }) => {
    const { waiting } = sceneOrFail();
    const reply = await factory.api.command('issue.pause', { project: LEDGER, issueNumber: waiting });
    expect(reply, JSON.stringify(reply.body)).toMatchObject({ status: 200 });
    await factory.api.until('the ledger reports room for a worktree again', (state) => projectOf(state, LEDGER).scheduler.worktreeShortage === null);
    await openCockpit(page, factory, paths.board());
    await expect(boardScope(page)).toHaveCount(0);
    await expect(page.getByText(english.t('pause.worktrees.badge'), { exact: true })).toHaveCount(0);
  });
});
