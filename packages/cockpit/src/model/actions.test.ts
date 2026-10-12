import { describe, expect, it } from 'vitest';
import type { PauseView } from '../contract/index.ts';
import { canAbandonIssue, canCutRelease, canEvaluateRelease, canPauseIssue, canStartIssue, dependenciesMerged, drainBlock, isDraining } from './actions.ts';

describe('dependenciesMerged', () => {
  const issues = [
    { number: 1, state: 'merged' as const },
    { number: 2, state: 'implementing' as const },
  ];

  it('holds when every dependency is merged or beyond', () => {
    expect(dependenciesMerged({ dependsOn: [1] }, issues)).toBe(true);
  });

  it('does not hold while a dependency is still in the pipeline', () => {
    expect(dependenciesMerged({ dependsOn: [1, 2] }, issues)).toBe(false);
  });

  it('ignores a dependency the project does not hold', () => {
    expect(dependenciesMerged({ dependsOn: [99] }, issues)).toBe(true);
  });
});

describe('issue actions', () => {
  it('starts a queued issue only when what it waits for is merged', () => {
    const project = { issues: [{ number: 1, state: 'implementing' as const, dependsOn: [] }] };
    expect(canStartIssue({ state: 'spec-validated', dependsOn: [1] }, project)).toBe(false);
    expect(canStartIssue({ state: 'spec-validated', dependsOn: [] }, project)).toBe(true);
    expect(canStartIssue({ state: 'spec-draft', dependsOn: [] }, project)).toBe(false);
  });

  it('abandons only an issue that needs a human', () => {
    expect(canAbandonIssue({ state: 'needs-human' })).toBe(true);
    expect(canAbandonIssue({ state: 'implementing' })).toBe(false);
  });

  it('pauses an active issue that is not paused yet', () => {
    expect(canPauseIssue({ state: 'implementing', paused: false })).toBe(true);
    expect(canPauseIssue({ state: 'implementing', paused: true })).toBe(false);
    expect(canPauseIssue({ state: 'spec-validated', paused: false })).toBe(false);
  });
});

describe('release actions', () => {
  it('never cuts or evaluates a release another version has overtaken', () => {
    expect(canCutRelease({ state: 'open', supersededBy: null })).toBe(true);
    expect(canCutRelease({ state: 'open', supersededBy: '1.8.0' })).toBe(false);
    expect(canEvaluateRelease({ state: 'blocked', supersededBy: null })).toBe(true);
    expect(canEvaluateRelease({ state: 'blocked', supersededBy: '1.8.0' })).toBe(false);
    expect(canEvaluateRelease({ state: 'open', supersededBy: null })).toBe(false);
  });
});

describe('drain', () => {
  const pauseFor = (cause: PauseView['cause']): PauseView => ({ scope: 'installation', cause, reason: 'for a test', since: '2026-10-12T09:00:00.000Z', resumesAt: null });
  const draining = [pauseFor('drain')];
  const paused = [pauseFor('operator'), pauseFor('resources')];

  it('tells a drain from the other pauses', () => {
    expect(isDraining(draining)).toBe(true);
    expect(isDraining(paused)).toBe(false);
    expect(isDraining([])).toBe(false);
  });

  it('asks the live and the rehearsing factory to stop, whether or not it is paused', () => {
    expect(drainBlock({ mode: 'live', pauses: [] })).toBeNull();
    expect(drainBlock({ mode: 'rehearsal', pauses: paused })).toBeNull();
  });

  it('refuses in the demonstration, which has no factory process to stop', () => {
    expect(drainBlock({ mode: 'demo', pauses: [] })).toBe('demonstration');
  });

  it('refuses a second drain while one is under way', () => {
    expect(drainBlock({ mode: 'live', pauses: draining })).toBe('underway');
  });
});
