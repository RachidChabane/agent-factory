import type { Locator, Page } from '@playwright/test';
import type { EnvironmentView, HealthSample } from '../../../packages/cockpit/src/contract/index.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { ONE_LOOK, untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { isLater } from '../../support/instants.ts';
import { environmentOf, firstOf } from '../../support/project-facts.ts';
import { LEDGER, STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const STAGING = 'staging';
const PRODUCTION = 'production';
const SANDBOX = 'sandbox';
const MIN_POINTS_FOR_TREND = 2;
const STATUS_WORDS: Readonly<Record<EnvironmentView['status'], string>> = { healthy: 'Healthy', degraded: 'Degraded', deploying: 'Deploying', down: 'Down', unknown: 'Unknown' };

function environmentCard(page: Page, name: string): Locator {
  return page.getByRole('article', { name, exact: true });
}

function healthCheckItem(card: Locator, environment: string, check: string): Locator {
  return card.getByRole('list', { name: `Health checks of ${environment}` }).getByRole('listitem').filter({ hasText: check });
}

function samplesWords(count: number): string {
  return `${count} ${count === 1 ? 'sample' : 'samples'}`;
}

/** What the figure of a health check says about the last day, in words. */
function dayCaption(series: readonly HealthSample[]): string {
  const passing = series.filter((sample) => sample.ok).length;
  const latencies = series.flatMap((sample) => (sample.latencyMs === null ? [] : [sample.latencyMs]));
  const counts = `Last 24 hours: ${samplesWords(series.length)}, ${passing} passing, ${series.length - passing} failing.`;
  return latencies.length === 0 ? `${counts} No sample measured a latency.` : `${counts} Latency from ${Math.min(...latencies)} ms to ${Math.max(...latencies)} ms.`;
}

async function expectHealthCheckShown(page: Page, factory: RunningFactory, project: string, environment: string): Promise<void> {
  await untilPageAgreesWithFactory(async () => {
    const check = firstOf(environmentOf(await factory.api.state(), project, environment).health, `health check of ${environment}`);
    const { latest, series } = check;
    if (latest === null) throw new Error(`the ${check.name} check of ${environment} was never sampled`);
    const item = healthCheckItem(environmentCard(page, environment), environment, check.name);
    await expect(item.getByRole('link', { name: check.url })).toHaveAttribute('href', check.url, ONE_LOOK);
    await expect(item).toContainText(latest.ok ? 'Passing' : 'Failing', ONE_LOOK);
    await expect(item).toContainText(latest.statusCode === null ? 'No response' : `Status ${latest.statusCode}`, ONE_LOOK);
    if (latest.latencyMs !== null) await expect(item).toContainText(`${latest.latencyMs} ms`, ONE_LOOK);
    await expect(item.getByRole('time')).toHaveAttribute('datetime', latest.at, ONE_LOOK);
    await expect(item.getByRole('time')).toContainText('Sampled', ONE_LOOK);
    await expect(item.getByRole('figure', { name: dayCaption(series), exact: true })).toBeVisible(ONE_LOOK);
  });
}

test.describe('the delivery pages of the demonstration', () => {
  test('shows the environments of a project and where each one stands', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.delivery(STOREFRONT));
    await expect(page.getByRole('heading', { level: 1, name: 'Delivery' })).toBeVisible();
    await expect(page.getByText('Environments, health checks and workflow runs of Storefront.')).toBeVisible();
    const state = await factory.api.state();
    const staging = environmentCard(page, STAGING);
    await expect(staging).toContainText(STATUS_WORDS[environmentOf(state, STOREFRONT, STAGING).status]);
    await expect(staging).toContainText('Promotion: Automatic');
    await expect(staging.getByText('Production', { exact: true })).toHaveCount(0);
    const production = environmentCard(page, PRODUCTION);
    await expect(production).toContainText(STATUS_WORDS[environmentOf(state, STOREFRONT, PRODUCTION).status]);
    await expect(production).toContainText('Promotion: Manual');
    await expect(production.getByText('Production', { exact: true })).toBeVisible();
  });

  test('says that an environment has no deployment source, so nothing can be redeployed', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.delivery(STOREFRONT));
    for (const name of [STAGING, PRODUCTION]) {
      await expect(environmentCard(page, name).getByRole('group', { name: 'Deployments' })).toContainText('No deployment source configured');
    }
    await expect(environmentCard(page, STAGING)).toContainText('No redeploy workflow is declared for this environment.');
    await expect(environmentCard(page, PRODUCTION)).toContainText('The factory never deploys production: the operator runs the production workflow.');
    await expect(page.getByRole('button', { name: /^Redeploy/ })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Workflow runs' })).toContainText(/forge has no workflow runs/);

    await openCockpit(page, factory, paths.delivery(LEDGER));
    await expect(environmentCard(page, SANDBOX).getByRole('group', { name: 'Deployments' })).toContainText('No deployment source configured');
  });

  test('shows each health check with its last sample, its read time and a chart of the last day', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.delivery(STOREFRONT));
    await expectHealthCheckShown(page, factory, STOREFRONT, STAGING);
    await expectHealthCheckShown(page, factory, STOREFRONT, PRODUCTION);
  });

  test('shows an environment whose health check fails as down', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.delivery(LEDGER));
    const sandbox = environmentCard(page, SANDBOX);
    const environment = environmentOf(await factory.api.state(), LEDGER, SANDBOX);
    const check = firstOf(environment.health, `health check of ${SANDBOX}`);
    expect(check.latest?.ok).toBe(false);
    await expect(sandbox).toContainText(STATUS_WORDS[environment.status]);
    await expect(healthCheckItem(sandbox, SANDBOX, check.name)).toContainText('Failing');
    await expect(healthCheckItem(sandbox, SANDBOX, check.name)).toContainText(`Status ${check.latest?.statusCode ?? ''}`);
    await expectHealthCheckShown(page, factory, LEDGER, SANDBOX);
  });

  test('samples the health of an environment when the operator asks for it', async ({ page, factory }) => {
    const environment = environmentOf(await factory.api.state(), STOREFRONT, STAGING);
    const check = firstOf(environment.health, `health check of ${STAGING}`);
    if (check.latest === null) throw new Error(`the ${check.name} check of ${STAGING} was never sampled`);
    const previous = { at: check.latest.at, samples: check.series.length };
    await openCockpit(page, factory, paths.delivery(STOREFRONT));
    await expect(environmentCard(page, STAGING).getByRole('button', { name: `Check health of ${STAGING}` })).toBeEnabled();

    const outcome = await clickCommand(page, 'health.check', async () => {
      await environmentCard(page, STAGING).getByRole('button', { name: `Check health of ${STAGING}` }).click();
    });
    expect(outcome.effect).toBe(`${environment.health.length} health check(s) of ${STAGING} sampled`);

    const state = await factory.api.until('a new sample of the check', (snapshot) => {
      const current = firstOf(environmentOf(snapshot, STOREFRONT, STAGING).health, `health check of ${STAGING}`);
      return isLater(current.latest?.at ?? null, previous.at) && current.series.length > previous.samples;
    });
    const sampled = firstOf(environmentOf(state, STOREFRONT, STAGING).health, `health check of ${STAGING}`);
    await expectHealthCheckShown(page, factory, STOREFRONT, STAGING);
    const latencyPoints = sampled.series.filter((sample) => sample.latencyMs !== null).length;
    if (latencyPoints >= MIN_POINTS_FOR_TREND) await expect(healthCheckItem(environmentCard(page, STAGING), STAGING, sampled.name).getByRole('img', { name: /^Latency: \d+ ms$/ })).toBeVisible();
  });
});
