import { describe, expect, it } from 'vitest';
import type { FactoryEventRecord } from '../contract/index.ts';
import { fixtureSnapshot, TEST_NOW } from '../test/render.tsx';
import { applyFactoryEvent } from './event-appliers.ts';

function record(type: string, subject: string, payload: unknown): FactoryEventRecord {
  return { sequence: 1, occurredAt: new Date(TEST_NOW).toISOString(), type, subject, payload };
}

describe('applyFactoryEvent', () => {
  it('escalates an issue and remembers where to resume', () => {
    const outcome = applyFactoryEvent(fixtureSnapshot(), record('issue.transitioned', 'issue/227', { from: 'implementing', to: 'needs-human', reason: 'gate failed twice' }));
    expect(outcome.kind).toBe('applied');
    if (outcome.kind !== 'applied') return;
    expect(outcome.snapshot.issues.find((issue) => issue.number === 227)).toMatchObject({
      state: 'needs-human',
      resumeTarget: 'implementing',
      escalation: { reason: 'gate failed twice' },
    });
  });

  it('concludes an audit with its verdict and findings', () => {
    const outcome = applyFactoryEvent(
      fixtureSnapshot(),
      record('audit.concluded', 'audit/A-16', { runId: 'run_x', verdict: 'keep', summary: 'fine', findings: [], proposedFix: null }),
    );
    expect(outcome.kind === 'applied' && outcome.snapshot.audits.find((audit) => audit.id === 'A-16')?.state).toBe('keep');
  });

  it('marks an audit resolved with its note', () => {
    const outcome = applyFactoryEvent(fixtureSnapshot(), record('audit.resolved', 'audit/A-15', { note: 'reverted' }));
    expect(outcome.kind === 'applied' && outcome.snapshot.audits.find((audit) => audit.id === 'A-15')).toMatchObject({ resolved: true, resolutionNote: 'reverted' });
  });

  it('turns a release promotable when its gate passes', () => {
    const outcome = applyFactoryEvent(
      fixtureSnapshot(),
      record('release.evaluated', 'release/storefront-v2.3.1', { releaseId: 'storefront-v2.3.1', promotable: true, blockingReasons: [], commitShas: [], report: '# ok' }),
    );
    expect(outcome.kind === 'applied' && outcome.snapshot.releases.find((release) => release.id === 'storefront-v2.3.1')).toMatchObject({
      state: 'promotable',
      gate: { promotable: true, blockingReasons: [] },
    });
  });

  it('finishes a run', () => {
    const usage = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheCreationTokens: 4 };
    const outcome = applyFactoryEvent(
      fixtureSnapshot(),
      record('run.finished', 'run/run_7f3a2c', { status: 'succeeded', outcome: 'success', endedAt: new Date(TEST_NOW).toISOString(), usage, costUsd: 1.5, turns: 9 }),
    );
    expect(outcome.kind === 'applied' && outcome.snapshot.runs.find((run) => run.id === 'run_7f3a2c')).toMatchObject({ status: 'succeeded', costUsd: 1.5, currentTool: null });
  });

  it('asks for a resync when the subject is not in the snapshot', () => {
    expect(applyFactoryEvent(fixtureSnapshot(), record('issue.transitioned', 'issue/999', { from: null, to: 'spec-draft', reason: 'new' })).kind).toBe('resync');
    expect(applyFactoryEvent(fixtureSnapshot(), record('audit.detected', 'audit/A-99', { commitSha: 'x', reason: 'direct-push', commitMessage: 'm', authorLogin: null, pullRequestNumber: null })).kind).toBe('resync');
  });

  it('rejects a malformed payload of a known event', () => {
    const outcome = applyFactoryEvent(fixtureSnapshot(), record('pr.opened', 'pr/311', { number: 'eleven' }));
    expect(outcome.kind).toBe('malformed');
  });

  it('reports unknown event types', () => {
    expect(applyFactoryEvent(fixtureSnapshot(), record('spec.something', 'issue/1', {})).kind).toBe('unknown');
  });
});
