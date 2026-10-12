import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { openCockpit, sidebar } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { AGENT_WORK_TEST_TIMEOUT_MS, AGENT_WORK_TIMEOUT_MS } from '../../support/factory-activity.ts';
import { isListening } from '../../support/ports.ts';
import { acceptSpec, findRunOfIssue, receiveChallengedRequest, settled } from '../../support/scenes.ts';
import { GIFT_FINDING, GIFT_PICKS_TITLE } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const STOPPED_LINE = 'Factory stopped';
const PORT_CLOSING_TIMEOUT_MS = 10_000;

test.describe('stopping the factory from the cockpit', () => {
  test('stops by itself once the running work finishes', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    await settled(factory);
    const request = await receiveChallengedRequest(factory, GIFT_FINDING);
    const release = await factory.holdAgents();
    try {
      const issueNumber = await acceptSpec(factory, request, GIFT_PICKS_TITLE, true);
      await factory.api.until(`a run of issue #${issueNumber} to be in progress`, (state) => findRunOfIssue(state, issueNumber, 'running') !== undefined);
      await openCockpit(page, factory, paths.board());

      const outcome = await clickCommand(page, 'factory.drain', async () => {
        await sidebar(page).getByRole('button', { name: 'Stop after running work', exact: true }).click();
        await page.getByRole('dialog', { name: 'Stop the factory once its running work finishes?' }).getByRole('button', { name: 'Stop after running work', exact: true }).click();
      });
      expect(outcome.effect).toBe('No new work starts; the factory stops once its 1 running issue(s) finish');

      const { installation } = await factory.api.state();
      expect(installation.pauses).toContainEqual(expect.objectContaining({ scope: 'installation', cause: 'drain' }));
      await expect(sidebar(page).getByRole('button', { name: /^Stop after running work/ })).toBeDisabled();
      await expect(sidebar(page)).toContainText('Scheduler draining');
      expect(factory.output()).not.toContain(STOPPED_LINE);
      await page.goto('about:blank');
    } finally {
      await release();
    }
    await expect.poll(() => factory.output(), { timeout: AGENT_WORK_TIMEOUT_MS }).toContain(STOPPED_LINE);
    await expect.poll(() => isListening(factory.port), { timeout: PORT_CLOSING_TIMEOUT_MS }).toBe(false);
  });
});
