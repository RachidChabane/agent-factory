import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { FILMS_IN_PROGRESS_REASON } from '../../../packages/application/src/film/film-merge-guard.ts';
import type { FilmToolWaitView } from '../../../packages/cockpit/src/contract/index.ts';
import type { I18n } from '../../../packages/cockpit/src/i18n/create-i18n.ts';
import type { Locale } from '../../../packages/cockpit/src/i18n/locale.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { ONE_LOOK, untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { issueOf, projectOf, pullRequestOf } from '../../support/api.ts';
import { openCockpit, recordCommandBodies, switchLanguage } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { AGENT_WORK_TEST_TIMEOUT_MS, AGENT_WORK_TIMEOUT_MS } from '../../support/factory-activity.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { factValue } from '../../support/facts.ts';
import { isLater } from '../../support/instants.ts';
import { settled, untilPullRequestIsOpen } from '../../support/scenes.ts';
import { specFileOf } from '../../support/spec-file.ts';
import { CART_BADGE_TOTAL, CATALOG_ADMIN, CHECKOUT_FLOW_SCENARIO, STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';
import { wordsIn } from '../../support/words.ts';

const SPEC_DIRECTORY = 'specs';
const SPEC_FILE = 'cart-badge-total.md';
const ISSUE_CREATED = /#(\d+) created/;
const FRENCH: Locale = 'fr';

/** The issue whose declared film waits for the catalogue tool, and the pull request it opened. */
interface Scene {
  readonly issue: number;
  readonly pullRequest: number;
}

let scene: Scene | null = null;

function sceneOrFail(): Scene {
  if (scene === null) throw new Error('the scene of the film that waits for a tool was never built');
  return scene;
}

/** Files the spec of the cart badge, which declares a film, the way an operator does at a terminal, and has the factory take it. */
async function createIssueDeclaringFilm(factory: RunningFactory): Promise<number> {
  if (factory.home === null) throw new Error('the factory keeps its home out of reach');
  const directory = join(factory.home, SPEC_DIRECTORY);
  await mkdir(directory, { recursive: true });
  const file = join(directory, SPEC_FILE);
  await writeFile(file, specFileOf(CART_BADGE_TOTAL.spec));
  const created = await factory.commandLine(['issue', 'create', file, '--project', STOREFRONT, '--start']);
  expect(created.exitCode, `${created.stdout}${created.stderr}`).toBe(0);
  const number = ISSUE_CREATED.exec(created.stdout)?.[1];
  if (number === undefined) throw new Error(`the command line named no issue: ${created.stdout}`);
  return Number(number);
}

async function waitForFilmsToWaitForTool(factory: RunningFactory): Promise<FilmToolWaitView> {
  const state = await factory.api.until(`the films of the storefront to wait for ${CATALOG_ADMIN}`, (snapshot) => projectOf(snapshot, STOREFRONT).filmToolWait?.tool === CATALOG_ADMIN);
  const wait = projectOf(state, STOREFRONT).filmToolWait;
  if (wait === null) throw new Error('the films of the storefront wait for no tool');
  return wait;
}

/** The notice that names the tool the films wait for, with why, what to run, since when, when it was checked, and the buttons that check it and log in. */
async function expectWaitNoticeTold(notice: Locator, wait: FilmToolWaitView, words: I18n): Promise<void> {
  await expect(notice).toContainText(words.t('filmWait.title', { tool: wait.tool }), ONE_LOOK);
  await expect(notice).toContainText(words.t('filmWait.status', { status: words.t(`vocab.toolStatus.${wait.status}`) }), ONE_LOOK);
  if (wait.loginCommand === null) throw new Error(`${wait.tool} declares no login`);
  await expect(notice).toContainText(wait.loginCommand, ONE_LOOK);
  await expect(notice).toContainText(words.t('filmWait.queued'), ONE_LOOK);
  await expect(notice.getByRole('time'), 'the time the films began to wait, then the time the tool was last checked').toHaveCount(2, ONE_LOOK);
  await expect(notice.getByRole('time').nth(0)).toHaveAttribute('datetime', wait.since, ONE_LOOK);
  await expect(notice.getByRole('time').nth(1)).toHaveAttribute('datetime', wait.checkedAt, ONE_LOOK);
  await expect(notice.getByRole('button', { name: words.t('tools.checkLabel', { tool: wait.tool }), exact: true })).toBeEnabled(ONE_LOOK);
  await expect(notice.getByRole('button', { name: words.t('tools.loginLabel', { tool: wait.tool }), exact: true })).toBeEnabled(ONE_LOOK);
}

/** What the pull request page says of the film that waits: the notice, the queued film, the hold on the ready notice and the blocker of the merge. */
async function expectFilmWaitTold(page: Page, factory: RunningFactory, words: I18n): Promise<void> {
  const { pullRequest } = sceneOrFail();
  await untilPageAgreesWithFactory(async () => {
    const state = await factory.api.state();
    const wait = projectOf(state, STOREFRONT).filmToolWait;
    if (wait === null) throw new Error('the films of the storefront wait for no tool');
    const films = page.getByRole('region', { name: words.t('pullRequests.films.title'), exact: true });
    await expectWaitNoticeTold(films.getByRole('region', { name: words.t('filmWait.label', { tool: wait.tool }), exact: true }), wait, words);

    const waitingState = words.t('pullRequests.films.state.waiting-for-tool', { tool: wait.tool });
    const queued = films.getByRole('region', { name: words.t('pullRequests.films.queueLabel', { scenario: CHECKOUT_FLOW_SCENARIO }), exact: true });
    await expect(queued).toContainText(words.t('pullRequests.films.queueTitle', { state: waitingState, scenario: CHECKOUT_FLOW_SCENARIO }), ONE_LOOK);
    await expect(queued, 'a film that waits for a tool has no arrival to expect').not.toContainText(/Expected around|Arrivée prévue|ahead of this one|devant celui-ci/, ONE_LOOK);

    const notice = page.getByRole('region', { name: words.t('pullRequests.ready.title'), exact: true });
    await expect(notice).toContainText(words.t('pullRequests.ready.description'), ONE_LOOK);
    await expect(notice.getByRole('list', { name: words.t('pullRequests.ready.holds') })).toContainText(
      words.t('pullRequests.ready.hold.films-waiting', { count: 1, scenarios: CHECKOUT_FLOW_SCENARIO, tool: wait.tool }),
      ONE_LOOK,
    );

    const blockers = pullRequestOf(state, STOREFRONT, pullRequest).mergeBlockers;
    expect(blockers, 'the factory names the tool in the blocker of the merge').toContain(`${FILMS_IN_PROGRESS_REASON}, waiting for the tool ${wait.tool}`);
    await expect(page.getByRole('region', { name: words.t('pullRequests.blocked.title'), exact: true }).getByRole('listitem')).toHaveText(blockers, ONE_LOOK);
  });
}

test.describe('the films of a pull request whose tool is logged out, in a rehearsal', () => {
  test.describe.configure({ mode: 'serial' });
  const english = wordsIn('en');
  const french = wordsIn(FRENCH);

  test('queues the declared film without failing it, and names the tool it waits for where the operator looks', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    await settled(factory);
    const issue = await createIssueDeclaringFilm(factory);
    const opened = await untilPullRequestIsOpen(factory, issue);
    const pullRequest = issueOf(opened, STOREFRONT, issue).pullRequestNumber;
    if (pullRequest === null) throw new Error(`issue #${issue} has no pull request`);
    scene = { issue, pullRequest };
    const wait = await waitForFilmsToWaitForTool(factory);
    expect(wait).toMatchObject({ tool: CATALOG_ADMIN, scope: 'project', status: 'unauthenticated' });
    expect(projectOf(await factory.api.state(), STOREFRONT).settings.films?.tools).toEqual([CATALOG_ADMIN]);

    await openCockpit(page, factory, paths.pullRequest(STOREFRONT, pullRequest));
    await expect(page.getByRole('region', { name: english.t('pullRequests.films.title'), exact: true })).toBeVisible();
    await expectFilmWaitTold(page, factory, english);
    await expect(page.getByRole('button', { name: 'Merge', exact: true })).toBeDisabled();
  });

  test('lists the tools a film needs on the settings of the project, with the same notice', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.projectSettings(STOREFRONT));
    const films = page.getByRole('region', { name: english.t('settings.films.title'), exact: true });
    await expect(factValue(films, english.t('settings.films.tools'))).toHaveText(CATALOG_ADMIN);
    await untilPageAgreesWithFactory(async () => {
      const wait = projectOf(await factory.api.state(), STOREFRONT).filmToolWait;
      if (wait === null) throw new Error('the films of the storefront wait for no tool');
      await expectWaitNoticeTold(films.getByRole('region', { name: english.t('filmWait.label', { tool: wait.tool }), exact: true }), wait, english);
    });
  });

  test('tells the same in French once the operator switches the language', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.pullRequest(STOREFRONT, sceneOrFail().pullRequest));
    await switchLanguage(page, FRENCH);
    await expectFilmWaitTold(page, factory, french);
  });

  test('checks the tool again on the operator’s order, then logs in to it, and the film records by itself', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    const { pullRequest } = sceneOrFail();
    const before = await waitForFilmsToWaitForTool(factory);
    const sent = recordCommandBodies(page);
    await openCockpit(page, factory, paths.pullRequest(STOREFRONT, pullRequest));
    const notice = page.getByRole('region', { name: english.t('filmWait.label', { tool: CATALOG_ADMIN }), exact: true });

    const checking = await clickCommand(page, 'tools.check', async () => {
      await notice.getByRole('button', { name: english.t('tools.checkLabel', { tool: CATALOG_ADMIN }), exact: true }).click();
    });
    expect(checking.effect).toBe(`${CATALOG_ADMIN}: ${before.status}`);
    const checked = await factory.api.until('the check ordered from the notice is the latest reading', (state) => isLater(projectOf(state, STOREFRONT).filmToolWait?.checkedAt ?? null, before.checkedAt));
    await untilPageAgreesWithFactory(async () => {
      const wait = projectOf(await factory.api.state(), STOREFRONT).filmToolWait;
      await expect(notice.getByRole('time').nth(1)).toHaveAttribute('datetime', wait?.checkedAt ?? '', ONE_LOOK);
    });
    expect(projectOf(checked, STOREFRONT).filmToolWait).toMatchObject({ tool: CATALOG_ADMIN, status: before.status });

    const loggingIn = await clickCommand(page, 'tools.login', async () => {
      await notice.getByRole('button', { name: english.t('tools.loginLabel', { tool: CATALOG_ADMIN }), exact: true }).click();
    });
    expect(loggingIn.effect).toMatch(new RegExp(`^${CATALOG_ADMIN}: login succeeded \\(.+\\); the tool is now connected$`));
    expect(sent).toEqual([
      { name: 'tools.check', body: { project: STOREFRONT, tool: CATALOG_ADMIN } },
      { name: 'tools.login', body: { project: STOREFRONT, tool: CATALOG_ADMIN } },
    ]);

    const recorded = await factory.api.until('the film that waited is recorded', (state) => pullRequestOf(state, STOREFRONT, pullRequest).films.some((film) => film.scenario === CHECKOUT_FLOW_SCENARIO), {
      timeoutMs: AGENT_WORK_TIMEOUT_MS,
    });
    expect(projectOf(recorded, STOREFRONT).filmToolWait).toBeNull();
    await untilPageAgreesWithFactory(async () => {
      await expect(notice).toHaveCount(0, ONE_LOOK);
      const films = page.getByRole('region', { name: english.t('pullRequests.films.title'), exact: true });
      await expect(films.getByRole('article', { name: english.t('pullRequests.films.scenario', { scenario: CHECKOUT_FLOW_SCENARIO }), exact: true })).toBeVisible(ONE_LOOK);
    });
  });
});
