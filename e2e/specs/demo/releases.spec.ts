import type { Locator, Page } from '@playwright/test';
import type { ReleaseCommit, ReleaseView } from '../../../packages/cockpit/src/contract/index.ts';
import { shortSha } from '../../../packages/cockpit/src/model/identifiers.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { ONE_LOOK, untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { projectOf } from '../../support/api.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { english } from '../../support/formats.ts';
import { isLater } from '../../support/instants.ts';
import { releaseOf } from '../../support/project-facts.ts';
import { STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const RELEASE_ID = 'v1.5.0';
const AUDIT_OPEN_REASON = /^audit (\S+) is open on commit (\S+)$/;
const NOT_REPORTED_BY_THE_FORGE = 'Author not reported by the forge';
const AUDIT_STATE_WORDS: Readonly<Record<string, string>> = { detected: 'detected', auditing: 'auditing', keep: 'keep', challenge: 'to challenge', rewrite: 'to rewrite' };
const GATE_CONDITIONS = ['Audits resolved', 'Evidence complete', 'Health before production'] as const;
const AUDIT_STATES_UNDER_WAY: readonly string[] = ['detected', 'auditing'];
const AUDIT_VERDICTS_TO_RESOLVE: readonly string[] = ['challenge', 'rewrite'];

function commitsWords(count: number): string {
  return `${count} ${count === 1 ? 'commit' : 'commits'}`;
}

/** A blocking reason as the operator reads it. */
function reasonWords(reason: string): string {
  const audit = AUDIT_OPEN_REASON.exec(reason);
  if (audit === null) return reason;
  const [, state = '', commit = ''] = audit;
  return `Audit “${AUDIT_STATE_WORDS[state] ?? state}” is open on commit ${shortSha(commit)}`;
}

/** The release once the factory evaluated its gate on its commits. */
async function evaluatedRelease(factory: RunningFactory): Promise<ReleaseView> {
  const state = await factory.api.until('the factory evaluated the gate of the release', (snapshot) => {
    const release = releaseOf(snapshot, STOREFRONT, RELEASE_ID);
    return release.gate.evaluatedAt !== null && release.commits.length > 0;
  });
  return releaseOf(state, STOREFRONT, RELEASE_ID);
}

function releaseGate(page: Page): Locator {
  return page.getByRole('region', { name: 'Release gate' });
}

function definitionOf(scope: Locator, term: string | RegExp): Locator {
  return scope.getByRole('term').filter({ hasText: term }).locator('xpath=following-sibling::*[1]');
}

function commitItem(page: Page, commit: ReleaseCommit): Locator {
  return page.getByRole('list', { name: 'Commits of the release' }).getByRole('listitem').filter({ hasText: shortSha(commit.sha) });
}

test.describe('the releases of the demonstration', () => {
  test('lists the releases of a project with their state, their source and their commits', async ({ page, factory }) => {
    const release = await evaluatedRelease(factory);
    expect(release.state).toBe('blocked');
    await openCockpit(page, factory, paths.releases(STOREFRONT));
    const list = page.getByRole('region', { name: 'Release list' });
    await untilPageAgreesWithFactory(async () => {
      const { releases } = projectOf(await factory.api.state(), STOREFRONT);
      await expect(list.getByRole('heading', { level: 1, name: `Releases ${releases.length}` })).toBeVisible(ONE_LOOK);
    });
    const item = list.getByRole('region', { name: 'Current', exact: true }).getByRole('link', { name: RELEASE_ID });
    await expect(item).toContainText('Blocked');
    await expect(item).toContainText('Tag');
    await expect(item).toContainText(commitsWords(release.commits.length));
    await expect(page.getByRole('article').getByRole('heading', { level: 1, name: RELEASE_ID })).toBeVisible();

    await item.click();
    await expect(page).toHaveURL(new URL(paths.release(STOREFRONT, RELEASE_ID), factory.origin).href);
    await expect(item).toHaveAttribute('aria-current', 'page');
  });

  test('shows the gate of a release with the reasons that block it and the conditions it weighs', async ({ page, factory }) => {
    const { gate } = await evaluatedRelease(factory);
    if (gate.evaluatedAt === null) throw new Error(`the gate of ${RELEASE_ID} was never evaluated`);
    expect(gate.promotable).toBe(false);
    await openCockpit(page, factory, paths.release(STOREFRONT, RELEASE_ID));
    const detail = page.getByRole('article');
    await expect(detail.getByRole('heading', { level: 1, name: RELEASE_ID })).toBeVisible();
    await expect(detail).toContainText('Blocked');
    await expect(detail).toContainText('Tag');

    const gateRegion = releaseGate(page);
    await expect(gateRegion).toContainText('Not promotable');
    await expect(gateRegion.getByRole('time')).toHaveAttribute('datetime', gate.evaluatedAt);
    await expect(gateRegion).toContainText('Gate evaluated');
    const reasons = gateRegion.getByRole('list', { name: 'Blocking reasons' }).getByRole('listitem');
    await expect(reasons).toHaveText(gate.blockingReasons.map(reasonWords));
    const conditions = gateRegion.getByRole('list', { name: 'Conditions' }).getByRole('listitem');
    await expect(conditions).toHaveCount(GATE_CONDITIONS.length);
    for (const condition of GATE_CONDITIONS) await expect(conditions.filter({ hasText: condition })).toHaveCount(1);
    await expect(gateRegion).toContainText('No production workflow is linked to this release.');
    await expect(page.getByRole('button', { name: 'Cut the release' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Re-evaluate the gate' })).toBeEnabled();
  });

  test('lists the commits of a release with who brought each one to the base branch', async ({ page, factory }) => {
    const release = await evaluatedRelease(factory);
    await openCockpit(page, factory, paths.release(STOREFRONT, RELEASE_ID));
    const commits = page.getByRole('region', { name: 'Commits', exact: true });
    await expect(commits).toContainText(commitsWords(release.commits.length));
    await expect(commits.getByRole('list', { name: 'Commits of the release' }).getByRole('listitem')).toHaveCount(release.commits.length);
    expect(new Set(release.commits.map((commit) => commit.attribution))).toEqual(new Set(['factory-merge', 'audit', 'automation']));

    for (const commit of release.commits) {
      const item = commitItem(page, commit);
      await expect(item).toContainText(commit.message);
      await expect(item).toContainText(commit.author ?? NOT_REPORTED_BY_THE_FORGE);
      if (commit.attribution === 'factory-merge') {
        await expect(item).toContainText('Factory merge');
        await expect(item).toContainText(commit.evidenceComplete === false ? 'Evidence incomplete' : 'Evidence complete');
        if (commit.pullRequestNumber !== null) await expect(item.getByRole('link', { name: `PR #${commit.pullRequestNumber}` })).toHaveAttribute('href', paths.pullRequest(STOREFRONT, commit.pullRequestNumber));
        if (commit.issueNumber !== null) await expect(item.getByRole('link', { name: `Issue #${commit.issueNumber}` })).toHaveAttribute('href', paths.issue(STOREFRONT, commit.issueNumber));
      }
      if (commit.attribution === 'audit' && commit.auditId !== null) {
        await expect(item).toContainText('Audited change');
        await expect(item.getByRole('link', { name: `Audit ${shortSha(commit.sha)} · ` })).toHaveAttribute('href', paths.audit(STOREFRONT, commit.auditId));
      }
      if (commit.attribution === 'automation') await expect(item).toContainText(commit.automation === null ? 'Not audited' : `Not audited: ${commit.automation}`);
    }
  });

  test('tells when the forge created a release apart from when the factory noticed it', async ({ page, factory }) => {
    const release = await evaluatedRelease(factory);
    if (release.createdAt === null || release.cutAt === null) throw new Error(`${RELEASE_ID} has no creation or cut time`);
    expect(isLater(release.detectedAt, release.createdAt), 'the factory notices a release after the forge created it').toBe(true);
    await openCockpit(page, factory, paths.release(STOREFRONT, RELEASE_ID));
    const timeline = page.getByRole('region', { name: 'Timeline' });
    const created = definitionOf(timeline, 'Created on the forge');
    const noticed = definitionOf(timeline, 'Noticed by the factory');
    await expect(timeline).toContainText('When the forge recorded the release pull request or the tag.');
    await expect(timeline).toContainText('When the factory first saw the release, which is not when it was created.');
    await expect(created.getByRole('time').first()).toHaveAttribute('datetime', release.createdAt);
    await expect(created.getByRole('time').first()).toHaveText(english.dateTime(release.createdAt));
    await expect(noticed.getByRole('time').first()).toHaveAttribute('datetime', release.detectedAt);
    await expect(noticed.getByRole('time').first()).toHaveText(english.dateTime(release.detectedAt));
    await expect(definitionOf(timeline, /^Cut$/).getByRole('time').first()).toHaveAttribute('datetime', release.cutAt);
    await expect(definitionOf(timeline, /^Promoted$/)).toHaveText('Not yet');
    await expect(definitionOf(timeline, /^Verified$/)).toHaveText('Not yet');
  });

  test('evaluates the gate of a release again and reports whether it can be promoted', async ({ page, factory }) => {
    const before = (await evaluatedRelease(factory)).gate.evaluatedAt;
    await openCockpit(page, factory, paths.release(STOREFRONT, RELEASE_ID));
    await expect(page.getByRole('article').getByRole('heading', { level: 1, name: RELEASE_ID })).toBeVisible();

    const outcome = await clickCommand(page, 'release.evaluate', async () => {
      await page.getByRole('button', { name: 'Re-evaluate the gate' }).click();
    });

    const state = await factory.api.until('the gate was evaluated again', (snapshot) => isLater(releaseOf(snapshot, STOREFRONT, RELEASE_ID).gate.evaluatedAt, before));
    const { gate, commits } = releaseOf(state, STOREFRONT, RELEASE_ID);
    expect(outcome.effect).toBe(gate.promotable ? `Release ${RELEASE_ID} is promotable` : `Release ${RELEASE_ID} is blocked: ${gate.blockingReasons.join('; ')}`);
    const holdingBack = projectOf(state, STOREFRONT).audits.filter(
      (audit) => commits.some((commit) => commit.sha === audit.commitSha) && (AUDIT_STATES_UNDER_WAY.includes(audit.state) || (AUDIT_VERDICTS_TO_RESOLVE.includes(audit.state) && !audit.resolved)),
    );
    const auditReasons = gate.blockingReasons.filter((reason) => AUDIT_OPEN_REASON.test(reason));
    expect(auditReasons, 'the gate blocks on the audits that are still open and on no other').toHaveLength(holdingBack.length);
    for (const audit of holdingBack) expect(auditReasons.some((reason) => reason.endsWith(audit.commitSha))).toBe(true);

    await untilPageAgreesWithFactory(async () => {
      const current = releaseOf(await factory.api.state(), STOREFRONT, RELEASE_ID).gate;
      await expect(releaseGate(page).getByRole('time')).toHaveAttribute('datetime', current.evaluatedAt ?? '', ONE_LOOK);
      await expect(releaseGate(page)).toContainText(current.promotable ? 'Promotable to production' : 'Not promotable', ONE_LOOK);
      await expect(releaseGate(page).getByRole('list', { name: 'Blocking reasons' }).getByRole('listitem')).toHaveCount(current.blockingReasons.length, ONE_LOOK);
    });
  });
});
