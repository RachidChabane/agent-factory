import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { issueOf, runsOfIssue } from '../../support/api.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { AGENT_WORK_TEST_TIMEOUT_MS } from '../../support/factory-activity.ts';
import { acceptSpec, findRunOfIssue, receiveChallengedRequest, runOfIssue, settled, untilPullRequestIsOpen, whileAgentsAreHeld } from '../../support/scenes.ts';
import { GIFT_FINDING, GIFT_PICKS_TITLE, PRICE_CEILING_TITLE, STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

async function untilTheRunIsStopped(factory: RunningFactory, runId: string) {
  return factory.api.until(`run ${runId} to be stopped`, (state) => state.runs.find((candidate) => candidate.id === runId)?.status === 'stopped');
}

async function untilTheIssueRunsAgain(factory: RunningFactory, issueNumber: number, stoppedRunId: string) {
  return factory.api.until(
    `issue #${issueNumber} to run again`,
    (state) => !issueOf(state, STOREFRONT, issueNumber).paused && runsOfIssue(state, STOREFRONT, issueNumber).some((run) => run.id !== stoppedRunId && run.status === 'running'),
  );
}

test.describe('the runs of an issue the factory is working on', () => {
  test.beforeAll(async ({ factory }) => {
    await settled(factory);
  });

  test('stops a run in progress, which pauses its issue, then lets the issue run again when the run is resumed', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    const request = await receiveChallengedRequest(factory, GIFT_FINDING);
    const issueNumber = await whileAgentsAreHeld(factory, async () => {
      const number = await acceptSpec(factory, request, GIFT_PICKS_TITLE, true);
      const started = await factory.api.until(`a run of issue #${number} to be in progress`, (state) => findRunOfIssue(state, number, 'running') !== undefined);
      const run = runOfIssue(started, number, 'running');
      await openCockpit(page, factory, paths.run(run.id));

      const stop = await clickCommand(page, 'run.stop', async () => {
        await page.getByRole('main').getByRole('button', { name: 'Stop', exact: true }).click();
        await page.getByRole('dialog', { name: 'Stop this run?' }).getByRole('button', { name: 'Stop the run', exact: true }).click();
      });
      expect(stop.effect).toBe(`Run ${run.id} stopped and issue #${number} paused`);
      expect(issueOf(await untilTheRunIsStopped(factory, run.id), STOREFRONT, number).paused).toBe(true);

      const resume = await clickCommand(page, 'run.resume', async () => {
        await page.getByRole('main').getByRole('button', { name: 'Resume', exact: true }).click();
      });
      expect(resume.effect).toBe(`Issue #${number} may run again; the daemon picks it up at its next tick`);
      await untilTheIssueRunsAgain(factory, number, run.id);
      return number;
    });
    await untilPullRequestIsOpen(factory, issueNumber);
  });

  test('pauses an issue while its run is in progress, then resumes it from the issue page', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    const request = await receiveChallengedRequest(factory, GIFT_FINDING);
    const issueNumber = await whileAgentsAreHeld(factory, async () => {
      const number = await acceptSpec(factory, request, PRICE_CEILING_TITLE, true);
      const started = await factory.api.until(`a run of issue #${number} to be in progress`, (state) => findRunOfIssue(state, number, 'running') !== undefined);
      const run = runOfIssue(started, number, 'running');
      await openCockpit(page, factory, paths.issue(STOREFRONT, number));

      const pause = await clickCommand(page, 'issue.pause', async () => {
        await page.getByRole('main').getByRole('button', { name: 'Pause', exact: true }).click();
        await page.getByRole('dialog', { name: `Pause #${number}?` }).getByRole('button', { name: 'Pause the issue', exact: true }).click();
      });
      expect(pause.effect).toBe(`Issue #${number} paused and its agent run stopped`);
      expect(issueOf(await untilTheRunIsStopped(factory, run.id), STOREFRONT, number).paused).toBe(true);

      const resume = await clickCommand(page, 'issue.resume', async () => {
        await page.getByRole('main').getByRole('button', { name: 'Resume', exact: true }).click();
      });
      expect(resume.effect).toBe(`Issue #${number} resumed; the daemon picks it up at its next tick`);
      await untilTheIssueRunsAgain(factory, number, run.id);
      return number;
    });
    await untilPullRequestIsOpen(factory, issueNumber);
  });
});
