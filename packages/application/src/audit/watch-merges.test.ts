import { describe, expect, it } from 'vitest';
import { DETECTED_AUDIT_REASONS, type DetectedAuditReason } from '@agent-factory/domain';
import { attributionRules, DEFAULT_PROJECT_CONVENTIONS } from '../conventions/project-conventions.ts';
import { loadAudits, loadSkippedChanges } from './audit-projection.ts';
import { readCursor, scanNewMerges, seedMergeCursor } from './watch-merges.ts';
import { FakeGitHubGateway, InMemoryEventStore, commit, factoryCommit } from './testing/fakes.ts';

const BRANCH = 'main';
const RULES = attributionRules(DEFAULT_PROJECT_CONVENTIONS);
const SETTINGS = { branch: BRANCH, startSha: null, rules: RULES };

function setup() {
  return { events: new InMemoryEventStore(), github: new FakeGitHubGateway() };
}

describe('scanNewMerges', () => {
  it('attributes factory merges without opening an audit', async () => {
    const dependencies = setup();
    dependencies.github.history.push(factoryCommit('f1', 10));
    const result = await scanNewMerges(dependencies, SETTINGS);
    expect(result).toEqual({ scanned: 1, detectedAuditIds: [], skippedShas: [], factoryMerges: [{ sha: 'f1', pullRequestNumber: 10 }], cursor: 'f1' });
    expect(await loadAudits(dependencies.events)).toEqual([]);
  });

  const AUDITED: readonly [DetectedAuditReason, Parameters<typeof commit>[0]][] = [
    ['direct-push', { sha: 'a1' }],
    ['bot-author', { sha: 'a2', authorLogin: 'dependabot[bot]', pullRequestNumber: 3, pullRequestBranch: 'factory/1-x', pullRequestLabels: ['factory'] }],
    ['branch-not-factory', { sha: 'a3', pullRequestNumber: 4, pullRequestBranch: 'feature/x', pullRequestLabels: ['factory'] }],
    ['missing-factory-label', { sha: 'a4', pullRequestNumber: 5, pullRequestBranch: 'factory/2-y', pullRequestLabels: [] }],
  ];

  it('covers every reason the merge watcher can detect', () => {
    expect(AUDITED.map(([reason]) => reason).sort()).toEqual([...DETECTED_AUDIT_REASONS].sort());
  });

  it.each(AUDITED)('detects an audit for %s', async (reason, overrides) => {
    const dependencies = setup();
    dependencies.github.history.push(commit(overrides));
    const result = await scanNewMerges(dependencies, SETTINGS);
    expect(result.detectedAuditIds).toEqual([overrides.sha]);
    const [audit] = await loadAudits(dependencies.events);
    expect(audit).toMatchObject({ id: overrides.sha, reason, state: 'detected' });
  });

  it('persists the cursor and never duplicates on rescan', async () => {
    const dependencies = setup();
    dependencies.github.history.push(factoryCommit('f1', 10), commit({ sha: 'a1' }));
    await scanNewMerges(dependencies, SETTINGS);
    const afterFirst = dependencies.events.records.length;
    expect(await readCursor(dependencies.events, BRANCH)).toBe('a1');

    const second = await scanNewMerges(dependencies, SETTINGS);
    expect(second).toEqual({ scanned: 0, detectedAuditIds: [], skippedShas: [], factoryMerges: [], cursor: 'a1' });
    expect(dependencies.events.records).toHaveLength(afterFirst);
  });

  it('picks up only the commits after the cursor', async () => {
    const dependencies = setup();
    dependencies.github.history.push(commit({ sha: 'a1' }));
    await scanNewMerges(dependencies, SETTINGS);
    dependencies.github.history.push(commit({ sha: 'a2' }));
    const result = await scanNewMerges(dependencies, SETTINGS);
    expect(result.detectedAuditIds).toEqual(['a2']);
    expect(dependencies.events.typesOf('audit/')).toEqual(['audit.detected', 'audit.detected']);
  });

  it('does not re-detect a commit whose cursor write was lost', async () => {
    const dependencies = setup();
    dependencies.github.history.push(commit({ sha: 'a1' }));
    await scanNewMerges(dependencies, SETTINGS);
    dependencies.events.records.splice(dependencies.events.records.findIndex((r) => r.type === 'audit.cursor.advanced'), 1);
    const result = await scanNewMerges(dependencies, SETTINGS);
    expect(result.detectedAuditIds).toEqual([]);
    expect(dependencies.events.typesOf('audit/')).toEqual(['audit.detected']);
  });

  it('starts from the configured sha when no cursor exists', async () => {
    const dependencies = setup();
    dependencies.github.history.push(commit({ sha: 'old' }), commit({ sha: 'new' }));
    const result = await scanNewMerges(dependencies, { ...SETTINGS, startSha: 'old' });
    expect(result.detectedAuditIds).toEqual(['new']);
  });
});

describe('the changes of other automations', () => {
  const AUTOMATION_SETTINGS = {
    ...SETTINGS,
    rules: { ...RULES, automations: [{ name: 'Issue bot', branches: ['bot/issue-*'], authors: [] }] },
  };

  it('records a change of another automation without auditing it', async () => {
    const dependencies = setup();
    dependencies.github.history.push(commit({ sha: 'b1', pullRequestNumber: 7, pullRequestBranch: 'bot/issue-7-typo', pullRequestLabels: [] }));
    const result = await scanNewMerges(dependencies, AUTOMATION_SETTINGS);
    expect(result).toMatchObject({ detectedAuditIds: [], skippedShas: ['b1'] });
    expect(await loadAudits(dependencies.events)).toEqual([]);
    expect(await loadSkippedChanges(dependencies.events)).toEqual([
      expect.objectContaining({ commitSha: 'b1', automation: 'Issue bot', pullRequestNumber: 7, pullRequestBranch: 'bot/issue-7-typo' }),
    ]);
  });

  it('records a skipped change once, even when its cursor write was lost', async () => {
    const dependencies = setup();
    dependencies.github.history.push(commit({ sha: 'b1', pullRequestNumber: 7, pullRequestBranch: 'bot/issue-7-typo', pullRequestLabels: [] }));
    await scanNewMerges(dependencies, AUTOMATION_SETTINGS);
    dependencies.events.records.splice(dependencies.events.records.findIndex((r) => r.type === 'audit.cursor.advanced'), 1);
    expect((await scanNewMerges(dependencies, AUTOMATION_SETTINGS)).skippedShas).toEqual([]);
    expect(dependencies.events.typesOf('audit/')).toEqual(['audit.skipped']);
  });

  it('drops a skipped change from the list once the operator has it audited', async () => {
    const dependencies = setup();
    dependencies.github.history.push(commit({ sha: 'b1', pullRequestNumber: 7, pullRequestBranch: 'bot/issue-7-typo', pullRequestLabels: [] }));
    await scanNewMerges(dependencies, AUTOMATION_SETTINGS);
    await dependencies.events.append('audit.detected', 'audit/b1', {
      commitSha: 'b1',
      reason: 'on-demand',
      commitMessage: 'fix: typo',
      authorLogin: null,
      pullRequestNumber: 7,
    });
    expect(await loadSkippedChanges(dependencies.events)).toEqual([]);
    expect(await loadAudits(dependencies.events)).toEqual([expect.objectContaining({ id: 'b1', reason: 'on-demand' })]);
  });
});

describe('seedMergeCursor', () => {
  it('starts watching at the current head instead of auditing the history', async () => {
    const events = new InMemoryEventStore();
    const github = new FakeGitHubGateway();
    github.history.push(commit({ sha: 'old1' }), commit({ sha: 'old2' }));
    expect(await seedMergeCursor({ events, github }, 'main')).toBe('old2');
    github.history.push(commit({ sha: 'new1' }));
    expect(await seedMergeCursor({ events, github }, 'main')).toBe('old2');
    const result = await scanNewMerges({ events, github }, SETTINGS);
    expect(result.detectedAuditIds).toEqual(['new1']);
  });
});
