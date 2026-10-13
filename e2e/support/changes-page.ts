import { expect, type Locator, type Page } from '@playwright/test';
import type { CockpitSnapshot } from '../../packages/cockpit/src/contract/index.ts';
import { shortSha } from '../../packages/cockpit/src/model/identifiers.ts';
import { deriveAttention } from '../../packages/cockpit/src/model/attention.ts';
import { buildChanges, PULL_REQUEST_EVENT_KINDS, type ChangedPullRequest, type EnvironmentLane } from '../../packages/cockpit/src/views/changes/changes-model.ts';
import { parseInstant, SINCE_QUERY_PARAMETER } from '../../packages/cockpit/src/views/changes/changes-since.ts';
import { ONE_LOOK } from './agreement.ts';
import { english } from './formats.ts';
import { wordsIn } from './words.ts';

const words = wordsIn('en');

/** The instant the page counts the changes from, as its address names it. */
export function sinceOf(page: Page): number {
  const since = parseInstant(new URL(page.url()).searchParams.get(SINCE_QUERY_PARAMETER));
  if (since === null) throw new Error('the address of the changes page names no period');
  return since;
}

function statValue(summary: Locator, label: string): Locator {
  return summary.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]');
}

/** The counts of the period against what the snapshot gives, and, beside the deployment counts, when the deployments were read. */
export async function expectSummaryShown(page: Page, state: CockpitSnapshot, since: number): Promise<void> {
  const { summary: counts } = buildChanges(state.projects, since);
  const summary = page.getByRole('group', { name: words.t('changes.summary.label') });
  await expect(statValue(summary, words.t('changes.summary.merged'))).toHaveText(String(counts.mergedPullRequests), ONE_LOOK);
  await expect(statValue(summary, words.t('changes.summary.awaiting'))).toHaveText(String(deriveAttention(state).length), ONE_LOOK);
  await expect(statValue(summary, words.t('changes.summary.deployments'))).toHaveText(String(counts.deployments), ONE_LOOK);
  await expect(statValue(summary, words.t('changes.summary.failed'))).toHaveText(String(counts.failedDeployments), ONE_LOOK);
  const stamps = summary.getByText(/^Read /);
  if (counts.deploymentsRead.kind === 'none') {
    await expect(stamps, 'no environment declares a source of deployments, so there is no reading to date').toHaveCount(0, ONE_LOOK);
    return;
  }
  if (counts.deploymentsRead.readAt === null) throw new Error('the factory never read the deployments the page counts');
  await expect(stamps).toHaveCount(2, ONE_LOOK);
  for (const stamp of await stamps.all()) await expect(stamp).toHaveAttribute('datetime', counts.deploymentsRead.readAt, ONE_LOOK);
}

async function expectPullRequestShown(page: Page, lane: Locator, pullRequest: ChangedPullRequest): Promise<void> {
  const link = page.getByRole('link', { name: `#${pullRequest.number} · ${pullRequest.title}`, exact: true });
  const item = lane.getByRole('listitem').filter({ has: link });
  await expect(item.getByRole('link', { name: `#${pullRequest.number} · ${pullRequest.title}`, exact: true })).toHaveAttribute('href', pullRequest.detailPath, ONE_LOOK);
  await expect(item).toContainText(words.t(`vocab.pullRequestState.${pullRequest.state}`), ONE_LOOK);
  await expect(item).toContainText(pullRequest.typeLabel, ONE_LOOK);
  await expect(item).toContainText(words.t('changes.issue', { number: pullRequest.issueNumber }), ONE_LOOK);
  for (const kind of PULL_REQUEST_EVENT_KINDS.filter((candidate) => pullRequest.events.some((event) => event.kind === candidate))) {
    await expect(item).toContainText(words.t(`changes.event.${kind}`), ONE_LOOK);
  }
  if (pullRequest.hasFilms) await expect(item).toContainText(words.t('changes.pullRequests.films'), ONE_LOOK);
  await expect(item.getByRole('time')).toHaveAttribute('datetime', pullRequest.lastEventAt, ONE_LOOK);
  await expect(item.getByRole('time')).toHaveAttribute('title', english.absolute(pullRequest.lastEventAt), ONE_LOOK);
}

/** Each project's pull requests that moved during the period, with the events that moved them and the time of the latest. */
export async function expectPullRequestLanesShown(page: Page, state: CockpitSnapshot, since: number): Promise<void> {
  for (const project of buildChanges(state.projects, since).projects) {
    const section = page.getByRole('region', { name: project.name, exact: true });
    const lane = section.getByRole('region', { name: words.t('changes.pullRequests.lane'), exact: true });
    if (project.pullRequests.length === 0) await expect(lane).toContainText(words.t('changes.pullRequests.empty'), ONE_LOOK);
    for (const pullRequest of project.pullRequests) await expectPullRequestShown(page, lane, pullRequest);
  }
}

async function expectDeploymentsShown(lane: Locator, entry: EnvironmentLane): Promise<void> {
  if (entry.reading === null) {
    await expect(lane).toContainText(words.t('changes.environment.noSource'), ONE_LOOK);
    return;
  }
  if (entry.reading.readAt === null) throw new Error(`the factory never read the deployments of ${entry.name}`);
  await expect(lane.getByText(/^Read /)).toHaveAttribute('datetime', entry.reading.readAt, ONE_LOOK);
  for (const deployment of entry.deployments) {
    await expect(lane.getByText(deployment.version, { exact: true }).first()).toBeVisible(ONE_LOOK);
    await expect(lane.locator(`time[datetime="${deployment.deployedAt}"]`).first()).toBeVisible(ONE_LOOK);
    await expect(lane).toContainText(shortSha(deployment.sha), ONE_LOOK);
    for (const commit of deployment.changes ?? []) {
      await expect(lane).toContainText(commit.headline, ONE_LOOK);
      await expect(lane.locator(`time[datetime="${commit.committedAt}"]`).first()).toBeVisible(ONE_LOOK);
    }
    if (deployment.changes === null) await expect(lane).toContainText(words.t('delivery.commits.unknown'), ONE_LOOK);
  }
  if (entry.pendingApplies && entry.current !== null) {
    await expect(lane.getByRole('group', { name: words.t('changes.environment.pending', { environment: entry.name }) })).toBeVisible(ONE_LOOK);
  }
}

/** Each environment of each project: its status with the time of the sample it comes from, and its deployments with their times. */
export async function expectEnvironmentLanesShown(page: Page, state: CockpitSnapshot, since: number): Promise<void> {
  for (const project of buildChanges(state.projects, since).projects) {
    const section = page.getByRole('region', { name: project.name, exact: true });
    for (const entry of project.lanes) {
      const lane = section.getByRole('region', { name: words.t('changes.environment.lane', { environment: entry.name }), exact: true });
      await expect(lane).toContainText(words.t(`vocab.environmentStatus.${entry.status}`), ONE_LOOK);
      if (entry.statusSampledAt === null) await expect(lane.getByText(/^Sampled /)).toHaveCount(0, ONE_LOOK);
      else await expect(lane.getByText(/^Sampled /)).toHaveAttribute('datetime', entry.statusSampledAt, ONE_LOOK);
      await expectDeploymentsShown(lane, entry);
    }
  }
}

/** What waits for the operator, in the order of the board's attention list, each with the time it began to wait. */
export async function expectAwaitingShown(page: Page, state: CockpitSnapshot): Promise<void> {
  const awaiting = page.getByRole('region', { name: words.t('changes.awaiting.title'), exact: true });
  const items = deriveAttention(state);
  if (items.length === 0) {
    await expect(awaiting).toContainText(words.t('changes.awaiting.empty'), ONE_LOOK);
    return;
  }
  await expect(awaiting.getByRole('link')).toHaveCount(items.length, ONE_LOOK);
  for (const [position, item] of items.entries()) {
    const link = awaiting.getByRole('link').nth(position);
    await expect(link).toHaveAttribute('href', item.href, ONE_LOOK);
    await expect(link).toContainText(item.reference, ONE_LOOK);
    await expect(link).toContainText(item.title, ONE_LOOK);
    await expect(link).toContainText(words.t(`attention.${item.kind}`), ONE_LOOK);
    await expect(link.getByRole('time')).toHaveAttribute('datetime', item.at, ONE_LOOK);
    await expect(link.getByRole('time')).toHaveAttribute('title', english.absolute(item.at), ONE_LOOK);
  }
}
