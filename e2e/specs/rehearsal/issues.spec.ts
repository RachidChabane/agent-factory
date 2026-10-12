import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { issueSubject } from '../../../packages/domain/src/index.ts';
import { issueOf } from '../../support/api.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { AGENT_WORK_TEST_TIMEOUT_MS } from '../../support/factory-activity.ts';
import { acceptSpec, eventAfter, pauseScheduler, receiveChallengedRequest, resumeScheduler, settled, untilPullRequestIsOpen } from '../../support/scenes.ts';
import { GIFT_FINDING, PRICE_CEILING_TITLE, STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const ISSUE_UNPAUSED_EVENT = 'issue.unpaused';

test.describe('an issue that waits to be started', () => {
  test('offers Start on a validated issue, and the daemon takes the issue once scheduling resumes', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    await settled(factory);
    const request = await receiveChallengedRequest(factory, GIFT_FINDING);
    await pauseScheduler(factory);
    try {
      const issueNumber = await acceptSpec(factory, request, PRICE_CEILING_TITLE, true);
      await factory.api.until(`issue #${issueNumber} to wait validated`, (state) => issueOf(state, STOREFRONT, issueNumber).state === 'spec-validated');
      await openCockpit(page, factory, paths.issue(STOREFRONT, issueNumber));
      const start = page.getByRole('main').getByRole('button', { name: 'Start', exact: true });
      await expect(start).toBeEnabled();

      const before = (await factory.api.state()).sequence;
      const outcome = await clickCommand(page, 'issue.start', async () => {
        await start.click();
      });
      expect(outcome.effect).toBe(`Issue #${issueNumber} may start; the daemon picks it up at its next tick`);

      const state = await factory.api.state();
      expect(eventAfter(state, before, { type: ISSUE_UNPAUSED_EVENT, subject: issueSubject(issueNumber) })).toBeDefined();
      expect(issueOf(state, STOREFRONT, issueNumber)).toMatchObject({ state: 'spec-validated', paused: false });

      await resumeScheduler(factory);
      await factory.api.until(`issue #${issueNumber} to be taken by the daemon`, (snapshot) => issueOf(snapshot, STOREFRONT, issueNumber).state !== 'spec-validated');
      await untilPullRequestIsOpen(factory, issueNumber);
    } finally {
      await resumeScheduler(factory);
    }
  });
});
