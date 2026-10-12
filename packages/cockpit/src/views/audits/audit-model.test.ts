import { AUDIT_STATES } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import type { AuditFindingView, AuditView, SkippedChangeView } from '../../contract/index.ts';
import { storefrontLinks } from '../../test/fixtures/forge-links.ts';
import { auditView } from '../../test/fixtures/seeds.ts';
import { auditGroupOf, auditOfSkippedChange, findingsByLevel, groupAudits, holdsRelease, holdsReleaseGate, newestSkippedFirst, orderedAudits } from './audit-model.ts';

function audit(id: string, overrides: Partial<AuditView> = {}): AuditView {
  return auditView({
    id,
    commitSha: id,
    reason: 'direct-push',
    commitMessage: `Change ${id}`,
    state: 'detected',
    detectedAt: '2026-10-10T09:00:00.000Z',
    changedFiles: null,
    suggestedType: null,
    ...overrides,
  }, storefrontLinks);
}

describe('auditGroupOf', () => {
  it.each([
    ['challenge', false, 'attention'],
    ['rewrite', false, 'attention'],
    ['challenge', true, 'settled'],
    ['rewrite', true, 'settled'],
    ['keep', false, 'settled'],
    ['detected', false, 'inProgress'],
    ['auditing', false, 'inProgress'],
  ] as const)('puts an audit that is %s and resolved: %s in the group %s', (state, resolved, group) => {
    expect(auditGroupOf({ state, resolved })).toBe(group);
  });

  it('leaves no state without a group', () => {
    for (const state of AUDIT_STATES) expect(['attention', 'inProgress', 'settled']).toContain(auditGroupOf({ state, resolved: false }));
  });
});

describe('groupAudits', () => {
  const toChallenge = audit('a1', { state: 'challenge', detectedAt: '2026-10-01T00:00:00.000Z' });
  const toRewrite = audit('a2', { state: 'rewrite', detectedAt: '2026-10-09T00:00:00.000Z' });
  const running = audit('a3', { state: 'auditing', detectedAt: '2026-10-05T00:00:00.000Z' });
  const detected = audit('a4', { state: 'detected', detectedAt: '2026-10-11T00:00:00.000Z' });
  const kept = audit('a5', { state: 'keep', detectedAt: '2026-10-07T00:00:00.000Z' });
  const resolved = audit('a6', { state: 'rewrite', resolved: true, detectedAt: '2026-10-08T00:00:00.000Z' });

  it('groups the audits by what they ask of the operator, the most recent first within a group', () => {
    const groups = groupAudits([kept, toChallenge, running, resolved, detected, toRewrite]);
    expect(groups.attention.map((entry) => entry.id)).toEqual(['a2', 'a1']);
    expect(groups.inProgress.map((entry) => entry.id)).toEqual(['a4', 'a3']);
    expect(groups.settled.map((entry) => entry.id)).toEqual(['a6', 'a5']);
  });

  it('orders the audits to handle first, then the ones in progress, then the settled ones', () => {
    expect(orderedAudits(groupAudits([kept, toChallenge, running, resolved, detected, toRewrite])).map((entry) => entry.id)).toEqual(['a2', 'a1', 'a4', 'a3', 'a6', 'a5']);
  });

  it('does not reorder the audits it was given', () => {
    const given = [kept, toChallenge];
    groupAudits(given);
    expect(given.map((entry) => entry.id)).toEqual(['a5', 'a1']);
  });
});

describe('release gate', () => {
  it.each([
    ['detected', false, true],
    ['auditing', false, true],
    ['challenge', false, true],
    ['rewrite', false, true],
    ['challenge', true, false],
    ['rewrite', true, false],
    ['keep', false, false],
  ] as const)('counts an audit that is %s and resolved: %s as open for the gate: %s', (state, resolved, open) => {
    expect(holdsReleaseGate({ state, resolved })).toBe(open);
  });

  it.each(['cut', 'auditing', 'blocked', 'promotable'] as const)('holds back a release whose gate is still weighed (%s)', (state) => {
    expect(holdsRelease({ state: 'challenge', resolved: false }, { state, supersededBy: null })).toBe(true);
  });

  it.each(['open', 'promoted', 'verified'] as const)('does not hold back a release that is %s', (state) => {
    expect(holdsRelease({ state: 'challenge', resolved: false }, { state, supersededBy: null })).toBe(false);
  });

  it('does not hold back a release another version has overtaken', () => {
    expect(holdsRelease({ state: 'challenge', resolved: false }, { state: 'blocked', supersededBy: '1.8.0' })).toBe(false);
  });

  it('holds back nothing when the release is unknown, or when the audit is closed', () => {
    expect(holdsRelease({ state: 'challenge', resolved: false }, undefined)).toBe(false);
    expect(holdsRelease({ state: 'keep', resolved: false }, { state: 'blocked', supersededBy: null })).toBe(false);
  });
});

describe('findingsByLevel', () => {
  const finding = (level: AuditFindingView['level'], statement: string): AuditFindingView => ({ level, statement, evidence: 'src/a.ts:1' });

  it('groups the findings under intent, idea and method, in that order, whatever the order they came in', () => {
    const groups = findingsByLevel([finding('method', 'm'), finding('intent', 'i1'), finding('idea', 'd'), finding('intent', 'i2')]);
    expect(groups.map((group) => [group.level, group.findings.map((entry) => entry.statement)])).toEqual([
      ['intent', ['i1', 'i2']],
      ['idea', ['d']],
      ['method', ['m']],
    ]);
  });

  it('leaves out the levels that have no finding', () => {
    expect(findingsByLevel([finding('method', 'm')]).map((group) => group.level)).toEqual(['method']);
    expect(findingsByLevel([])).toEqual([]);
  });
});

describe('auditOfSkippedChange', () => {
  it('finds the audit of the same commit, and none when the change was never audited', () => {
    const audits = [audit('abc'), audit('def', { state: 'keep' })];
    expect(auditOfSkippedChange(audits, { commitSha: 'def' })?.state).toBe('keep');
    expect(auditOfSkippedChange(audits, { commitSha: 'zzz' })).toBeUndefined();
  });
});

describe('newestSkippedFirst', () => {
  const change = (commitSha: string, recordedAt: string): SkippedChangeView => ({
    commitSha,
    automation: 'dependency-updates',
    commitMessage: commitSha,
    authorLogin: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    branch: null,
    recordedAt,
  });

  it('puts the most recently recorded change first without reordering what it was given', () => {
    const given = [change('old', '2026-10-01T00:00:00.000Z'), change('new', '2026-10-11T00:00:00.000Z'), change('middle', '2026-10-05T00:00:00.000Z')];
    expect(newestSkippedFirst(given).map((entry) => entry.commitSha)).toEqual(['new', 'middle', 'old']);
    expect(given.map((entry) => entry.commitSha)).toEqual(['old', 'new', 'middle']);
  });
});
