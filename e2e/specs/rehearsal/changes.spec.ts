import { buildChanges } from '../../../packages/cockpit/src/views/changes/changes-model.ts';
import { untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { expectAwaitingShown, expectEnvironmentLanesShown, expectPullRequestLanesShown, expectSummaryShown, sinceOf } from '../../support/changes-page.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { expect, test } from '../../support/test.ts';

/** Before every deployment the local forge of a rehearsal reports, whatever day the specs run. */
const PERIOD_START = '2026-09-01T00:00:00.000Z';
const STAGING_DEPLOYMENTS = 2;

test.describe('the landing page of a rehearsal', () => {
  test('counts the deployments the local forge reports, dates the reading they come from and the commits they brought', async ({ page, factory }) => {
    await openCockpit(page, factory, `/?since=${encodeURIComponent(PERIOD_START)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Changes' })).toBeVisible();
    const since = sinceOf(page);
    expect(since).toBe(Date.parse(PERIOD_START));
    expect(buildChanges((await factory.api.state()).projects, since).summary).toMatchObject({ deployments: STAGING_DEPLOYMENTS, failedDeployments: 0, deploymentsRead: { kind: 'read' } });
    await untilPageAgreesWithFactory(async () => {
      const state = await factory.api.state();
      await expectSummaryShown(page, state, since);
      await expectPullRequestLanesShown(page, state, since);
      await expectAwaitingShown(page, state);
      await expectEnvironmentLanesShown(page, state, since);
    });
  });
});
