import type { Locator, Page } from '@playwright/test';
import type { CockpitSnapshot, ToolView } from '../../../packages/cockpit/src/contract/index.ts';
import { en } from '../../../packages/cockpit/src/i18n/catalog/en/index.ts';
import { MINUTE_MS } from '../../../packages/cockpit/src/i18n/formatters.ts';
import { ONE_LOOK, untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { projectOf } from '../../support/api.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { english } from '../../support/formats.ts';
import { isLater } from '../../support/instants.ts';
import { CATALOG_ADMIN, STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const INSTALLATION_SETTINGS = '/settings';
const STOREFRONT_SETTINGS = `/projects/${STOREFRONT}/settings`;
const DESIGN_EXPORT = 'design-export';
const OPERATOR = 'Alex Morgan';

function storefrontToolOf(state: CockpitSnapshot, name: string): ToolView {
  const tool = projectOf(state, STOREFRONT).tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`the storefront declares no tool ${name}`);
  return tool;
}

function toolRow(page: Page, name: string): Locator {
  return page.getByRole('listitem', { name, exact: true });
}

function statusLabel(tool: ToolView): string {
  return tool.status === null ? en['tools.neverChecked'] : en[`vocab.toolStatus.${tool.status}`];
}

async function expectToolRow(row: Locator, tool: ToolView): Promise<void> {
  await expect(row).toContainText(statusLabel(tool), ONE_LOOK);
  await expect(row).toContainText(tool.builtIn ? en['tools.builtIn'] : en['tools.declared'], ONE_LOOK);
  await expect(row).toContainText(tool.version ?? en['tools.noVersion'], ONE_LOOK);
  await expect(row).toContainText(tool.detail ?? en['tools.noResult'], ONE_LOOK);
  if (tool.description !== null) await expect(row).toContainText(tool.description, ONE_LOOK);
  if (tool.installHint !== null) await expect(row).toContainText(`Install: ${tool.installHint}`, ONE_LOOK);
  await expect(row.getByRole('button', { name: `Check ${tool.name}`, exact: true })).toBeVisible(ONE_LOOK);
  if (tool.checkedAt !== null) await expect(row.getByText(/^Checked /)).toHaveAttribute('datetime', tool.checkedAt, ONE_LOOK);
}

async function expectSummary(scope: Locator, tools: readonly ToolView[]): Promise<void> {
  const connected = tools.filter((tool) => tool.status === 'connected').length;
  await expect(scope.getByText(`${connected} of ${tools.length} connected`)).toBeVisible(ONE_LOOK);
}

test.describe('the tools of the installation', () => {
  test('lists the tools the factory depends on with their last check', async ({ page, factory }) => {
    await openCockpit(page, factory, INSTALLATION_SETTINGS);
    const section = page.getByRole('region', { name: 'Tools', exact: true });
    await untilPageAgreesWithFactory(async () => {
      const { tools } = await factory.api.state();
      expect(tools.length).toBeGreaterThan(0);
      await expectSummary(section, tools);
      for (const tool of tools) await expectToolRow(toolRow(page, tool.name), tool);
    });
  });
});

test.describe('the tools of the storefront', () => {
  test.beforeEach(async ({ page, factory }) => {
    await openCockpit(page, factory, STOREFRONT_SETTINGS);
    await expect(page.getByRole('heading', { level: 1, name: 'Project settings' })).toBeVisible();
  });

  test('lists the tools the checks of the project rely on, with how to install them and how to sign in', async ({ page, factory }) => {
    const section = page.getByRole('region', { name: 'Tools', exact: true });
    await untilPageAgreesWithFactory(async () => {
      const { tools } = projectOf(await factory.api.state(), STOREFRONT);
      expect(tools.map((tool) => tool.name)).toEqual([DESIGN_EXPORT, CATALOG_ADMIN]);
      await expectSummary(section, tools);
      for (const tool of tools) await expectToolRow(toolRow(page, tool.name), tool);
    });
    const { loginCommand, keepAlive } = storefrontToolOf(await factory.api.state(), CATALOG_ADMIN);
    expect(loginCommand).not.toBeNull();
    expect(keepAlive).not.toBeNull();
    const row = toolRow(page, CATALOG_ADMIN);
    await expect(row.getByRole('button', { name: `Log in to ${CATALOG_ADMIN}`, exact: true })).toBeVisible();
    await expect(row).toContainText(en['tools.lastLogin']);
    await expect(row).toContainText(`${keepAlive?.command ?? ''}, every ${english.duration((keepAlive?.everyMinutes ?? 0) * MINUTE_MS)}`);
    await expect(toolRow(page, DESIGN_EXPORT).getByRole('button', { name: /^Log in to/ })).toHaveCount(0);
  });

  test('checks a tool the project declares but the machine lacks, and reports it as missing', async ({ page, factory }) => {
    const before = storefrontToolOf(await factory.api.state(), DESIGN_EXPORT);
    const row = toolRow(page, DESIGN_EXPORT);
    const outcome = await clickCommand(page, 'tools.check', async () => {
      await row.getByRole('button', { name: `Check ${DESIGN_EXPORT}`, exact: true }).click();
    });
    const state = await factory.api.until('the tool was checked again', (current) => isLater(storefrontToolOf(current, DESIGN_EXPORT).checkedAt, before.checkedAt));
    const after = storefrontToolOf(state, DESIGN_EXPORT);
    expect(outcome.effect).toBe(`${DESIGN_EXPORT}: ${after.status}`);
    expect(after.status).toBe('missing');
    expect(after.detail).toContain(DESIGN_EXPORT);
    await expect(row).toContainText(en['vocab.toolStatus.missing']);
    await expect(row).toContainText(after.detail ?? '');
    await expect(row.getByText(/^Checked /)).toHaveAttribute('datetime', after.checkedAt ?? '');
  });

  test('logs in to a tool that is not signed in, then shows the login and that the tool is connected', async ({ page, factory }) => {
    const before = storefrontToolOf(await factory.api.state(), CATALOG_ADMIN);
    expect(before.status).toBe('unauthenticated');
    expect(before.lastLogin).toBeNull();
    const row = toolRow(page, CATALOG_ADMIN);
    const outcome = await clickCommand(page, 'tools.login', async () => {
      await row.getByRole('button', { name: `Log in to ${CATALOG_ADMIN}`, exact: true }).click();
    });
    expect(outcome.effect).toMatch(new RegExp(`^${CATALOG_ADMIN}: login succeeded \\(.+\\); the tool is now connected$`));
    const state = await factory.api.until('the tool is connected', (current) => storefrontToolOf(current, CATALOG_ADMIN).status === 'connected');
    const after = storefrontToolOf(state, CATALOG_ADMIN);
    expect(after.lastLogin?.outcome).toBe('succeeded');
    expect(after.lastLogin?.operator).toBe(OPERATOR);
    expect(isLater(after.checkedAt, before.checkedAt)).toBe(true);
    await untilPageAgreesWithFactory(async () => {
      const { tools } = projectOf(await factory.api.state(), STOREFRONT);
      await expectSummary(page.getByRole('region', { name: 'Tools', exact: true }), tools);
      await expectToolRow(row, storefrontToolOf(await factory.api.state(), CATALOG_ADMIN));
    });
    await expect(row).toContainText(`${en['tools.lastLogin']} ${en['vocab.toolSessionOutcome.succeeded']}`);
    await expect(row).toContainText(en['tools.session.by'].replace('{operator}', OPERATOR));
  });
});
