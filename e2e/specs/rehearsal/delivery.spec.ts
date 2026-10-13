import type { Locator, Page } from '@playwright/test';
import { deploymentSubject, REDEPLOY_DISPATCHED_EVENT } from '../../../packages/application/src/delivery/delivery-events.ts';
import { shortSha } from '../../../packages/cockpit/src/model/identifiers.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { DEMO_PROJECTS } from '../../../packages/server/src/demo/demo-projects.ts';
import { ONE_LOOK, untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { localForgeOf } from '../../support/forge-files.ts';
import { environmentOf } from '../../support/project-facts.ts';
import { UNRELEASED_CHANGE_MESSAGE } from '../../support/rehearsal-layout.ts';
import { eventAfter } from '../../support/scenes.ts';
import { STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';
import { wordsIn } from '../../support/words.ts';

const STAGING = 'staging';
const PRODUCTION = 'production';
const CURRENT_VERSION = 'v1.4.0';
const PREVIOUS_VERSION = 'v1.3.0';
const REDEPLOY_WORKFLOW = 'deploy-staging.yml';
const BASE_BRANCH = 'main';
const words = wordsIn('en');

/** The message of the commit the storefront's history tags with the version: what a deployment of that version brought. */
function commitTaggedWith(version: string): string {
  const message = DEMO_PROJECTS.find((project) => project.id === STOREFRONT)?.history.find((commit) => commit.tag === version)?.message;
  if (message === undefined) throw new Error(`the history of the storefront tags no commit ${version}`);
  return message;
}

function environmentCard(page: Page, name: string): Locator {
  return page.getByRole('article', { name, exact: true });
}

test.describe('the delivery of the storefront in a rehearsal', () => {
  test('shows the deployments of staging read from the local forge, with the latest one current', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.delivery(STOREFRONT));
    const deployments = environmentCard(page, STAGING).getByRole('group', { name: 'Deployments' });
    await expect(deployments).toContainText('Currently deployed');
    const history = deployments.getByRole('table', { name: `Deployment history of ${STAGING}` });
    await expect(history.getByRole('row').filter({ hasText: CURRENT_VERSION })).toContainText('Current');
    await expect(history.getByRole('row').filter({ hasText: PREVIOUS_VERSION })).not.toContainText('Current');

    const staging = environmentOf(await factory.api.state(), STOREFRONT, STAGING);
    expect(staging.redeployable).toBe(true);
    expect(staging.deployments?.value?.current?.version).toBe(CURRENT_VERSION);
    expect(staging.deployments?.value?.history.map((deployment) => deployment.version)).toEqual([CURRENT_VERSION, PREVIOUS_VERSION]);
  });

  test('lists the commits the current deployment delivered and those that wait for staging, and says the commits of a deployment are unknown when its predecessor is', async ({ page, factory }) => {
    const reading = environmentOf(await factory.api.state(), STOREFRONT, STAGING).deployments;
    const history = reading?.value;
    if (history === null || history === undefined || history.current === null || history.pending === null) throw new Error('the factory did not read the deployments of staging with their commits');
    const { current, pending } = history;
    expect(current.changes?.map((commit) => commit.headline), 'the commits between the previous deployment and the current one').toEqual([commitTaggedWith(CURRENT_VERSION)]);
    expect(history.history.find((deployment) => deployment.version === PREVIOUS_VERSION)?.changes, 'no deployment precedes the first one').toBeNull();
    expect(pending.map((commit) => commit.headline), 'the commits of the base branch the current deployment lacks').toContain(UNRELEASED_CHANGE_MESSAGE);

    await openCockpit(page, factory, paths.delivery(STOREFRONT));
    const deployments = environmentCard(page, STAGING).getByRole('group', { name: 'Deployments' });
    const delivered = deployments.getByText(words.t('delivery.commits.delivered'), { exact: true }).locator('xpath=..');
    for (const commit of current.changes ?? []) {
      const item = delivered.getByRole('listitem').filter({ hasText: commit.headline });
      await expect(item).toContainText(shortSha(commit.sha));
      await expect(item).toContainText(commit.author);
      await expect(item.getByRole('time')).toHaveAttribute('datetime', commit.committedAt);
    }

    const waiting = deployments.getByRole('group', { name: words.t('delivery.commits.pending.title') });
    await expect(waiting).toContainText(words.t('delivery.commits.pending.count', { count: pending.length, branch: BASE_BRANCH }));
    for (const commit of pending) {
      const item = waiting.getByRole('listitem').filter({ hasText: commit.headline });
      await expect(item).toContainText(commit.author);
      await expect(item.getByRole('time')).toHaveAttribute('datetime', commit.committedAt);
    }

    const table = deployments.getByRole('table', { name: `Deployment history of ${STAGING}` });
    await expect(table.getByRole('row').filter({ hasText: CURRENT_VERSION })).toContainText(words.t('delivery.commits.count', { count: current.changes?.length ?? 0 }));
    const unknown = table.getByRole('row').filter({ hasText: PREVIOUS_VERSION }).getByText(words.t('delivery.commits.unknown.short'));
    await expect(unknown).toHaveAttribute('title', words.t('delivery.commits.unknown'));

    await untilPageAgreesWithFactory(async () => {
      const read = environmentOf(await factory.api.state(), STOREFRONT, STAGING).deployments?.readAt ?? null;
      await expect(deployments.getByText(/^Read /)).toHaveAttribute('datetime', read ?? '', ONE_LOOK);
    });
  });

  test('offers no redeploy of production, which the factory never deploys', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.delivery(STOREFRONT));
    const production = environmentCard(page, PRODUCTION);
    await expect(production).toContainText('The factory never deploys production: the operator runs the production workflow.');
    await expect(production.getByRole('button', { name: /^Redeploy/ })).toHaveCount(0);
  });

  test('redeploys staging once the deployed version is typed in the dialog', async ({ page, factory }) => {
    const forge = localForgeOf(factory, STOREFRONT);
    const dispatchesBefore = await forge.workflowDispatches();
    await openCockpit(page, factory, paths.delivery(STOREFRONT));
    await environmentCard(page, STAGING).getByRole('button', { name: `Redeploy ${STAGING}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Redeploy ${STAGING}?` });
    const confirm = dialog.getByRole('button', { name: `Redeploy ${CURRENT_VERSION}`, exact: true });
    const typed = dialog.getByRole('textbox', { name: 'Deployed version' });
    await expect(confirm).toBeDisabled();
    await typed.fill(PREVIOUS_VERSION);
    await expect(dialog.getByText(`This is not the version deployed on ${STAGING}.`)).toBeVisible();
    await expect(confirm).toBeDisabled();
    await typed.fill(CURRENT_VERSION);
    await expect(confirm).toBeEnabled();

    const before = (await factory.api.state()).sequence;
    const outcome = await clickCommand(page, 'deployment.redeploy', async () => {
      await confirm.click();
    });
    expect(outcome.effect).toBe(`${REDEPLOY_WORKFLOW} dispatched on ${CURRENT_VERSION} to redeploy ${CURRENT_VERSION} to ${STAGING} (simulated by the local forge)`);

    const dispatches = await forge.workflowDispatches();
    expect(dispatches).toHaveLength(dispatchesBefore.length + 1);
    expect(dispatches.at(-1)).toMatchObject({ workflow: REDEPLOY_WORKFLOW, ref: CURRENT_VERSION, inputs: { version: CURRENT_VERSION, target: STAGING } });
    const state = await factory.api.state();
    expect(eventAfter(state, before, { type: REDEPLOY_DISPATCHED_EVENT, subject: deploymentSubject(STAGING) })).toBeDefined();
    await expect(dialog).toBeHidden();
  });
});
