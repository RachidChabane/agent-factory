import type { Locator, Page } from '@playwright/test';
import { forgeFilePath, type AuditFindingLevel, type AuditView, type CockpitSnapshot } from '../../../packages/cockpit/src/contract/index.ts';
import { shortSha } from '../../../packages/cockpit/src/model/identifiers.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { ONE_LOOK, untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { projectOf } from '../../support/api.ts';
import { openCockpit, recordCommandsSent } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { AGENT_WORK_TEST_TIMEOUT_MS, AGENT_WORK_TIMEOUT_MS, untilNoAgentIsWorking } from '../../support/factory-activity.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { english } from '../../support/formats.ts';
import { auditOf, firstOf } from '../../support/project-facts.ts';
import { STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const DEPENDENCY_UPDATES = 'Dependency updates';
const RESOLUTION_NOTE = 'The merchandising owner confirmed the price and a test now pins it to the price list.';
const CONCLUSION_TITLE = 'Auditor’s conclusion';
const LEVEL_WORDS: Readonly<Record<AuditFindingLevel, string>> = { intent: 'Intent', idea: 'Idea', method: 'Method' };
const OPEN_AUDIT_STATES: readonly string[] = ['detected', 'auditing'];

function directPushAudit(state: CockpitSnapshot): AuditView {
  return firstOf(projectOf(state, STOREFRONT).audits.filter((audit) => audit.reason === 'direct-push'), 'audit of a direct push');
}

/** The audit of the direct push once the auditor concluded, its issue is drafted and the files of the change are read. */
async function concludedDirectPushAudit(factory: RunningFactory): Promise<AuditView> {
  const state = await factory.api.until('the auditor concluded the audit of the direct push', (snapshot) => {
    const audit = directPushAudit(snapshot);
    return audit.conclusion !== null && audit.draft !== null && audit.changedFiles !== null;
  });
  return directPushAudit(state);
}

function auditList(page: Page): Locator {
  return page.getByRole('region', { name: 'Audit list' });
}

function viewSwitch(page: Page): Locator {
  return auditList(page).getByRole('radiogroup', { name: 'Show' });
}

function auditsRadio(page: Page): Locator {
  return viewSwitch(page).getByRole('radio', { name: /^\d+ audits?$/ });
}

function notAuditedRadio(page: Page): Locator {
  return viewSwitch(page).getByRole('radio', { name: /^\d+ changes? not audited$/ });
}

async function openAudit(page: Page, factory: RunningFactory, audit: AuditView): Promise<void> {
  await openCockpit(page, factory, paths.audit(STOREFRONT, audit.id));
  await expect(page.getByRole('article').getByRole('heading', { level: 1, name: audit.commitMessage })).toBeVisible();
}

function issueNumberOf(effect: string | null, audit: AuditView): number {
  const opened = new RegExp(`^Issue #(\\d+) opened from the audit of ${shortSha(audit.commitSha)}$`).exec(effect ?? '');
  if (opened === null) throw new Error(`the factory did not say which issue it opened: ${effect ?? 'no effect'}`);
  return Number(opened[1]);
}

test.describe('the audits of the demonstration', () => {
  test('lists the audits of a project and opens the audit of the direct push with what the auditor concluded', async ({ page, factory }) => {
    const audit = await concludedDirectPushAudit(factory);
    const { conclusion, draft } = audit;
    if (conclusion === null || draft === null) throw new Error(`the audit of ${shortSha(audit.commitSha)} has no conclusion or no draft`);
    await openCockpit(page, factory, paths.audits(STOREFRONT));
    await untilPageAgreesWithFactory(async () => {
      const { audits } = projectOf(await factory.api.state(), STOREFRONT);
      await expect(auditList(page).getByRole('heading', { level: 1, name: `Audits ${audits.length}` })).toBeVisible(ONE_LOOK);
    });
    await expect(auditsRadio(page)).toBeChecked();
    await expect(notAuditedRadio(page)).not.toBeChecked();
    const item = auditList(page).getByRole('region', { name: 'To handle', exact: true }).getByRole('link', { name: audit.commitMessage });
    await expect(item).toContainText(shortSha(audit.commitSha));
    await expect(item).toContainText('Direct push');
    await expect(item).toContainText('To challenge');

    const detail = page.getByRole('article');
    await expect(detail.getByRole('heading', { level: 1, name: audit.commitMessage })).toBeVisible();
    await expect(detail).toContainText('To challenge');
    await expect(detail).toContainText(`Author: ${audit.authorLogin ?? ''}`);
    await expect(detail).toContainText(audit.pullRequestNumber === null ? 'No pull request' : `PR #${audit.pullRequestNumber}`);
    await expect(detail).toContainText(audit.branch ?? 'No branch reported');
    await expect(detail).toContainText(`Detected ${english.dateTime(audit.detectedAt)}`);
    await expect(detail.getByRole('button', { name: 'Copy the commit SHA' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Direct push' })).toContainText('The commit reached the base branch without a pull request.');
    if (audit.releaseId !== null) await expect(detail.getByRole('link', { name: `Release ${audit.releaseId}`, exact: true })).toHaveAttribute('href', paths.release(STOREFRONT, audit.releaseId));

    const conclusionRegion = page.getByRole('region', { name: CONCLUSION_TITLE });
    await expect(conclusionRegion).toContainText(conclusion.summary);
    await expect(conclusionRegion.getByRole('link', { name: `Open the auditor run ${conclusion.runId}` })).toHaveAttribute('href', paths.run(conclusion.runId));
    for (const level of new Set(conclusion.findings.map((finding) => finding.level))) await expect(conclusionRegion).toContainText(LEVEL_WORDS[level]);
    for (const finding of conclusion.findings) {
      await expect(conclusionRegion).toContainText(finding.statement);
      await expect(conclusionRegion).toContainText(finding.evidence);
    }
    if (conclusion.proposedFix !== null) await expect(page.getByRole('region', { name: 'Proposed fix' })).toContainText(conclusion.proposedFix);

    const changed = audit.changedFiles;
    if (changed === null) throw new Error(`the factory never read the files of ${shortSha(audit.commitSha)}`);
    await expect(page.getByRole('region', { name: 'Changed files' }).getByRole('list', { name: 'Files changed by the commit' }).getByRole('listitem')).toHaveText(changed);

    const issue = page.getByRole('region', { name: 'Audit issue' });
    await expect(issue).toContainText('Draft ready to publish on the repository.');
    await expect(issue).toContainText(draft.title);
    await expect(issue.getByRole('figure', { name: /^Issue body/ })).toContainText('## Change');
    await expect(issue.getByRole('figure', { name: /^Issue body/ })).toContainText(audit.commitSha);
  });

  test('lists the changes recorded without an audit and names the automation behind each', async ({ page, factory }) => {
    const { skippedChanges } = projectOf(await factory.api.state(), STOREFRONT);
    const change = firstOf(skippedChanges, 'change recorded without an audit');
    expect(change.automation).toBe(DEPENDENCY_UPDATES);
    await openCockpit(page, factory, paths.audits(STOREFRONT));
    await notAuditedRadio(page).click();
    await expect(notAuditedRadio(page)).toBeChecked();
    await expect(auditList(page)).toContainText('Changes made by other automations of the repository. The factory records them without auditing them.');
    const changes = auditList(page).getByRole('list', { name: 'Changes not audited' }).getByRole('listitem');
    await untilPageAgreesWithFactory(async () => {
      const current = projectOf(await factory.api.state(), STOREFRONT).skippedChanges;
      await expect(changes).toHaveCount(current.length, ONE_LOOK);
    });
    const item = changes.filter({ hasText: shortSha(change.commitSha) });
    await expect(item).toContainText(`Not audited: ${change.automation}`);
    await expect(item).toContainText(change.commitMessage);
    await expect(item).toContainText(change.authorLogin ?? 'No author reported');
    await expect(item).toContainText(change.branch ?? 'No branch reported');
    await expect(item).toContainText(change.pullRequestNumber === null ? 'No pull request' : `PR #${change.pullRequestNumber}`);
    await expect(item.getByRole('button', { name: `Request audit of ${shortSha(change.commitSha)}` })).toBeEnabled();

    await auditsRadio(page).click();
    await expect(auditsRadio(page)).toBeChecked();
    await expect(auditList(page).getByRole('list', { name: 'Changes not audited' })).toHaveCount(0);
  });

  test('publishes the issue the auditor drafted and names it on the audit', async ({ page, factory }) => {
    const audit = await concludedDirectPushAudit(factory);
    const { draft } = audit;
    if (draft === null) throw new Error(`the audit of ${shortSha(audit.commitSha)} has no draft`);
    expect(audit.publishedIssueNumber).toBeNull();
    await openAudit(page, factory, audit);

    const outcome = await clickCommand(page, 'audit.publish-issue', async () => {
      await page.getByRole('button', { name: 'Publish the audit issue' }).click();
    });
    const issueNumber = issueNumberOf(outcome.effect, audit);

    await factory.api.until('the audit names the issue that was opened', (state) => auditOf(state, STOREFRONT, audit.id).publishedIssueNumber === issueNumber);
    const onForge = await page.request.get(`${factory.origin}${forgeFilePath(STOREFRONT, `issues/${issueNumber}.md`)}`);
    expect(onForge.ok(), `the forge holds issue #${issueNumber}`).toBe(true);
    expect(await onForge.text()).toContain(draft.title);

    const issueSection = page.getByRole('region', { name: 'Audit issue' });
    await expect(issueSection.getByText(`Published as issue #${issueNumber}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish the audit issue' })).toHaveCount(0);
    await expect(issueSection).toContainText(draft.title);
    const listed = projectOf(await factory.api.state(), STOREFRONT).issues.some((issue) => issue.number === issueNumber);
    await expect(issueSection.getByRole('link', { name: `Published as issue #${issueNumber}` })).toHaveCount(listed ? 1 : 0);
  });

  test('asks for a note before marking an audit as resolved and sends nothing without it', async ({ page, factory }) => {
    const audit = await concludedDirectPushAudit(factory);
    const sent = recordCommandsSent(page);
    await openAudit(page, factory, audit);
    await page.getByRole('button', { name: 'Mark as resolved', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Mark ${shortSha(audit.commitSha)} as resolved?` });
    await expect(dialog).toContainText('The note stays with the audit. A resolved audit does not hold back the release gate.');
    await dialog.getByRole('button', { name: 'Mark as resolved', exact: true }).click();
    await expect(dialog.getByText('Write how the audit was resolved.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(sent).toEqual([]);
    expect(auditOf(await factory.api.state(), STOREFRONT, audit.id).resolved).toBe(false);
  });

  test('marks an audit as resolved with a note and takes it off the list of what needs the operator', async ({ page, factory }) => {
    const audit = await concludedDirectPushAudit(factory);
    await openAudit(page, factory, audit);
    const dialog = page.getByRole('dialog', { name: `Mark ${shortSha(audit.commitSha)} as resolved?` });
    const outcome = await clickCommand(page, 'audit.resolve', async () => {
      await page.getByRole('button', { name: 'Mark as resolved', exact: true }).click();
      await dialog.getByRole('textbox', { name: 'Resolution note' }).fill(RESOLUTION_NOTE);
      await dialog.getByRole('button', { name: 'Mark as resolved', exact: true }).click();
    });
    expect(outcome.effect).toBe(`The audit of ${shortSha(audit.commitSha)} is resolved`);

    const state = await factory.api.until('the audit is resolved', (snapshot) => auditOf(snapshot, STOREFRONT, audit.id).resolved);
    expect(auditOf(state, STOREFRONT, audit.id).resolutionNote).toBe(RESOLUTION_NOTE);

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('region', { name: 'Resolved', exact: true })).toContainText(RESOLUTION_NOTE);
    await expect(page.getByRole('button', { name: 'Mark as resolved', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Publish the audit issue' })).toHaveCount(0);
    await expect(auditList(page).getByRole('region', { name: 'Settled', exact: true }).getByRole('link', { name: audit.commitMessage })).toContainText('Resolved');
    await expect(auditList(page).getByRole('region', { name: 'To handle', exact: true })).toHaveCount(0);
  });

  test('requests the audit of a change recorded without one and waits for the auditor to conclude', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    const before = projectOf(await factory.api.state(), STOREFRONT);
    const change = firstOf(before.skippedChanges, 'change recorded without an audit');
    const commit = shortSha(change.commitSha);
    await openCockpit(page, factory, paths.audits(STOREFRONT));
    await notAuditedRadio(page).click();

    const outcome = await clickCommand(page, 'audit.request', async () => {
      await page.getByRole('button', { name: `Request audit of ${commit}` }).click();
    });
    expect(outcome.effect).toMatch(new RegExp(`^(An audit of ${commit} is queued; the daemon picks it up at its next tick|Change ${commit} already has an audit)$`));

    const requested = await factory.api.until('the change has an audit', (state) => projectOf(state, STOREFRONT).audits.some((audit) => audit.commitSha === change.commitSha));
    const audit = firstOf(projectOf(requested, STOREFRONT).audits.filter((candidate) => candidate.commitSha === change.commitSha), 'audit of the requested change');
    expect(audit.reason).toBe('on-demand');
    await untilPageAgreesWithFactory(async () => {
      const current = projectOf(await factory.api.state(), STOREFRONT);
      await expect(notAuditedRadio(page)).toHaveAccessibleName(`${current.skippedChanges.length} ${current.skippedChanges.length === 1 ? 'change' : 'changes'} not audited`, ONE_LOOK);
      await expect(auditsRadio(page)).toHaveAccessibleName(`${current.audits.length} ${current.audits.length === 1 ? 'audit' : 'audits'}`, ONE_LOOK);
    });
    await expect(auditList(page).getByRole('list', { name: 'Changes not audited' }).filter({ hasText: commit })).toHaveCount(0);

    await factory.api.until('the auditor concluded', (state) => {
      const current = auditOf(state, STOREFRONT, audit.id);
      return !OPEN_AUDIT_STATES.includes(current.state) && current.conclusion !== null;
    }, { timeoutMs: AGENT_WORK_TIMEOUT_MS });
    await untilNoAgentIsWorking(factory);
    await auditsRadio(page).click();
    await expect(auditList(page).getByRole('link', { name: change.commitMessage })).toContainText('Requested by the operator');
  });
});
