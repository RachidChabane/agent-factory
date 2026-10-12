import { describe, expect, it } from 'vitest';
import { attributeCommit, type AttributableCommit, type AttributionRules } from './merge-attribution.ts';

const RULES: AttributionRules = { branchPrefix: 'factory/', factoryLabel: 'factory', automations: [] };

const FACTORY_COMMIT: AttributableCommit = {
  authorLogin: 'operator',
  pullRequestNumber: 12,
  pullRequestBranch: 'factory/12-add-thing',
  pullRequestLabels: ['factory', 'ui'],
};

describe('merge attribution', () => {
  it('attributes a factory branch with the factory label to the factory', () => {
    expect(attributeCommit(FACTORY_COMMIT, RULES)).toEqual({ kind: 'factory-merge' });
  });

  it('follows the branch prefix and the label the project names', () => {
    const rules: AttributionRules = { branchPrefix: 'bot/', factoryLabel: 'made-by-bot', automations: [] };
    expect(attributeCommit({ ...FACTORY_COMMIT, pullRequestBranch: 'bot/12-add-thing', pullRequestLabels: ['made-by-bot'] }, rules)).toEqual({ kind: 'factory-merge' });
    expect(attributeCommit(FACTORY_COMMIT, rules)).toEqual({ kind: 'audit', reason: 'branch-not-factory' });
  });

  it('audits direct pushes', () => {
    expect(attributeCommit({ ...FACTORY_COMMIT, pullRequestNumber: null, pullRequestBranch: null }, RULES)).toEqual({
      kind: 'audit',
      reason: 'direct-push',
    });
  });

  it('audits bots even on a factory branch', () => {
    expect(attributeCommit({ ...FACTORY_COMMIT, authorLogin: 'dependabot[bot]' }, RULES)).toEqual({
      kind: 'audit',
      reason: 'bot-author',
    });
  });

  it('audits other branches and missing labels', () => {
    expect(attributeCommit({ ...FACTORY_COMMIT, pullRequestBranch: 'feature/x' }, RULES)).toEqual({
      kind: 'audit',
      reason: 'branch-not-factory',
    });
    expect(attributeCommit({ ...FACTORY_COMMIT, pullRequestBranch: null }, RULES).kind).toBe('audit');
    expect(attributeCommit({ ...FACTORY_COMMIT, pullRequestLabels: ['ui'] }, RULES)).toEqual({
      kind: 'audit',
      reason: 'missing-factory-label',
    });
  });

  it('records the changes of another automation instead of auditing them', () => {
    const rules: AttributionRules = {
      ...RULES,
      automations: [
        { name: 'Issue bot', branches: ['bot/issue-*'], authors: [] },
        { name: 'Dependency updates', branches: [], authors: ['renovate[bot]'] },
      ],
    };
    expect(attributeCommit({ ...FACTORY_COMMIT, pullRequestBranch: 'bot/issue-41-fix-typo', pullRequestLabels: [] }, rules)).toEqual({
      kind: 'automation',
      automation: 'Issue bot',
    });
    expect(attributeCommit({ ...FACTORY_COMMIT, authorLogin: 'renovate[bot]', pullRequestBranch: 'renovate/vitest-4.x' }, rules)).toEqual({
      kind: 'automation',
      automation: 'Dependency updates',
    });
    expect(attributeCommit({ ...FACTORY_COMMIT, authorLogin: 'dependabot[bot]' }, rules)).toEqual({ kind: 'audit', reason: 'bot-author' });
  });

  it('requires both the branch and the author when an automation names both', () => {
    const rules: AttributionRules = { ...RULES, automations: [{ name: 'Release bot', branches: ['release/*'], authors: ['release-bot'] }] };
    expect(attributeCommit({ ...FACTORY_COMMIT, authorLogin: 'release-bot', pullRequestBranch: 'release/1.2.0' }, rules).kind).toBe('automation');
    expect(attributeCommit({ ...FACTORY_COMMIT, authorLogin: 'someone', pullRequestBranch: 'release/1.2.0' }, rules).kind).toBe('audit');
    expect(attributeCommit({ ...FACTORY_COMMIT, authorLogin: 'release-bot', pullRequestNumber: null, pullRequestBranch: null }, rules).kind).toBe('audit');
  });

  it('never lets an empty automation pattern swallow every change', () => {
    const rules: AttributionRules = { ...RULES, automations: [{ name: 'Everything', branches: [], authors: [] }] };
    expect(attributeCommit({ ...FACTORY_COMMIT, pullRequestNumber: null, pullRequestBranch: null }, rules)).toEqual({ kind: 'audit', reason: 'direct-push' });
  });
});
