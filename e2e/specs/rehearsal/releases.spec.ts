import { RELEASE_CUT_EVENT } from '../../../packages/application/src/release/cut-release.ts';
import { releaseSubject } from '../../../packages/application/src/release/events.ts';
import type { CockpitSnapshot, ReleaseView } from '../../../packages/cockpit/src/contract/index.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { projectOf } from '../../support/api.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand, type CommandOutcome } from '../../support/commands.ts';
import { localForgeOf } from '../../support/forge-files.ts';
import { releaseOf } from '../../support/project-facts.ts';
import { eventAfter, settled, untilAuditConcluded } from '../../support/scenes.ts';
import { STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const RELEASE_NOTICE_TIMEOUT_MS = 180_000;
const CHECKS_TIMEOUT_MS = 90_000;
const CHECKS_RETRY_INTERVAL_MS = 3_000;
const RELEASE_TEST_TIMEOUT_MS = 300_000;
const SHORT_SHA_LENGTH = 7;

function openRelease(state: CockpitSnapshot): ReleaseView | undefined {
  return projectOf(state, STOREFRONT).releases.find((release) => release.state === 'open' && release.supersededBy === null);
}

test.describe('the release of the storefront in a rehearsal', () => {
  test.describe.configure({ mode: 'serial' });
  let noticed: ReleaseView | undefined;
  let mergeSha: string | null = null;

  function release(): ReleaseView & { readonly pullRequestNumber: number } {
    if (noticed === undefined || noticed.pullRequestNumber === null) throw new Error('the factory noticed no release pull request');
    return { ...noticed, pullRequestNumber: noticed.pullRequestNumber };
  }

  test.beforeAll(async ({ factory }) => {
    test.setTimeout(RELEASE_TEST_TIMEOUT_MS);
    const state = await factory.api.until('the release pull request to be noticed with its commits', (snapshot) => (openRelease(snapshot)?.commits.length ?? 0) > 0, { timeoutMs: RELEASE_NOTICE_TIMEOUT_MS });
    noticed = openRelease(state);
  });

  test('refuses to cut the release while the checks of its pull request still run', async ({ page, factory }) => {
    const { id, pullRequestNumber } = release();
    await openCockpit(page, factory, paths.release(STOREFRONT, id));
    const cut = page.getByRole('button', { name: 'Cut the release', exact: true });
    await expect(cut).toBeEnabled();

    const refusal = await clickCommand(
      page,
      'release.cut',
      async () => {
        await cut.click();
      },
      { status: 409 },
    );
    expect(refusal.error).toContain('checks still running');

    expect(releaseOf(await factory.api.state(), STOREFRONT, id).state).toBe('open');
    expect((await localForgeOf(factory, STOREFRONT).pullRequests()).find((pull) => pull.number === pullRequestNumber)?.state).toBe('open');
  });

  test('cuts the release once the checks of its pull request have passed', async ({ page, factory }) => {
    test.setTimeout(RELEASE_TEST_TIMEOUT_MS);
    const { id, pullRequestNumber } = release();
    const forge = localForgeOf(factory, STOREFRONT);
    await openCockpit(page, factory, paths.release(STOREFRONT, id));
    const cut = page.getByRole('button', { name: 'Cut the release', exact: true });
    await expect(cut).toBeEnabled();

    const before = (await factory.api.state()).sequence;
    let outcome: CommandOutcome | undefined;
    await expect(async () => {
      outcome = await clickCommand(page, 'release.cut', async () => {
        await cut.click();
      });
    }).toPass({ timeout: CHECKS_TIMEOUT_MS, intervals: [CHECKS_RETRY_INTERVAL_MS] });

    const merged = (await forge.pullRequests()).find((pull) => pull.number === pullRequestNumber);
    expect(merged).toMatchObject({ state: 'merged' });
    mergeSha = merged?.mergeSha ?? null;
    expect(outcome?.effect).toBe(`Release ${id} cut: pull request #${pullRequestNumber} merged as ${merged?.mergeSha?.slice(0, SHORT_SHA_LENGTH)}`);
    const state = await factory.api.state();
    expect(releaseOf(state, STOREFRONT, id).state).not.toBe('open');
    expect(releaseOf(state, STOREFRONT, id).cutAt).not.toBeNull();
    expect(eventAfter(state, before, { type: RELEASE_CUT_EVENT, subject: releaseSubject(id) })).toBeDefined();
    await expect(cut).toHaveCount(0);
  });

  test('audits the merge of the release pull request, which reached main outside the factory', async ({ factory }) => {
    test.setTimeout(RELEASE_TEST_TIMEOUT_MS);
    if (mergeSha === null) throw new Error('the release pull request was not merged');
    const audit = await untilAuditConcluded(factory, mergeSha);
    expect(audit).toMatchObject({ commitSha: mergeSha, resolved: false });
    await settled(factory);
  });
});
