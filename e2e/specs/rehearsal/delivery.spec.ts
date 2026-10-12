import type { Locator, Page } from '@playwright/test';
import { deploymentSubject, REDEPLOY_DISPATCHED_EVENT } from '../../../packages/application/src/delivery/delivery-events.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { localForgeOf } from '../../support/forge-files.ts';
import { environmentOf } from '../../support/project-facts.ts';
import { eventAfter } from '../../support/scenes.ts';
import { STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const STAGING = 'staging';
const PRODUCTION = 'production';
const CURRENT_VERSION = 'v1.4.0';
const PREVIOUS_VERSION = 'v1.3.0';
const REDEPLOY_WORKFLOW = 'deploy-staging.yml';

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
