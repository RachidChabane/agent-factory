import { describe, expect, it } from 'vitest';
import type { AttributableCommit } from './merge-attribution.ts';
import { attributeCommit } from './merge-attribution.ts';

const FACTORY_COMMIT: AttributableCommit = {
  authorLogin: 'operator',
  pullRequestNumber: 12,
  pullRequestBranch: 'factory/12-add-thing',
  pullRequestLabels: ['factory', 'ui'],
};

describe('merge attribution', () => {
  it('attributes a factory branch with the factory label to the factory', () => {
    expect(attributeCommit(FACTORY_COMMIT)).toEqual({ kind: 'factory-merge' });
  });

  it('audits direct pushes', () => {
    expect(attributeCommit({ ...FACTORY_COMMIT, pullRequestNumber: null, pullRequestBranch: null })).toEqual({
      kind: 'audit',
      reason: 'direct-push',
    });
  });

  it('audits bots even on a factory branch', () => {
    expect(attributeCommit({ ...FACTORY_COMMIT, authorLogin: 'dependabot[bot]' })).toEqual({
      kind: 'audit',
      reason: 'bot-author',
    });
  });

  it('audits other branches and missing labels', () => {
    expect(attributeCommit({ ...FACTORY_COMMIT, pullRequestBranch: 'feature/x' })).toEqual({
      kind: 'audit',
      reason: 'branch-not-factory',
    });
    expect(attributeCommit({ ...FACTORY_COMMIT, pullRequestBranch: null }).kind).toBe('audit');
    expect(attributeCommit({ ...FACTORY_COMMIT, pullRequestLabels: ['ui'] })).toEqual({
      kind: 'audit',
      reason: 'missing-factory-label',
    });
  });
});
