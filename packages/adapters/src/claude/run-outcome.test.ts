import type { GateDecision } from '@agent-factory/plugin';
import { describe, expect, it } from 'vitest';
import {
  decideOutcome,
  decisionRequested,
  gateBlocksOf,
  gateSatisfied,
  outcomeOfResult,
  type GateEvidence,
  type RunConclusion,
} from './run-outcome.ts';
import type { ResultLine } from './stream/stream-schemas.ts';

function result(subtype: string, isError = false): ResultLine {
  return { type: 'result', subtype, is_error: isError };
}

function decision(passed: boolean): GateDecision {
  return {
    decidedAt: '2026-10-10T00:00:00.000Z',
    sessionId: 'session',
    stopHookActive: false,
    passed,
    failure: passed ? null : 'gate-failed',
    durationMs: 10,
    steps: [],
  };
}

function requested(): GateDecision {
  return { ...decision(false), failure: 'decision-requested' };
}

const BLOCKED = { blocked: true };
const RELEASED = { blocked: false };

const BLOCKED_THEN_PASSED: GateEvidence = {
  decisions: [decision(false), decision(true)],
  stopHookResponses: [BLOCKED, RELEASED],
};

const COMPLETED: RunConclusion = {
  termination: 'exited',
  result: result('success'),
  gateRequired: true,
  gate: BLOCKED_THEN_PASSED,
  tamperedRunFiles: [],
};

describe('outcomeOfResult', () => {
  it.each([
    ['success', false, 'success'],
    ['success', true, 'error'],
    ['error_max_turns', true, 'max-turns'],
    ['error_max_budget_usd', true, 'budget-exceeded'],
    ['error_during_execution', true, 'error'],
    ['error_max_structured_output_retries', true, 'error'],
    ['a_future_subtype', false, 'error'],
  ] as const)('maps %s (is_error %s) to %s', (subtype, isError, outcome) => {
    expect(outcomeOfResult(result(subtype, isError))).toBe(outcome);
  });
});

describe('gateSatisfied', () => {
  it('accepts a final passing decision that matches the final non-blocking stop response', () => {
    expect(gateSatisfied(BLOCKED_THEN_PASSED)).toBe(true);
  });

  it('rejects a run whose last stop was still blocked, as when the block cap ends the turn', () => {
    expect(gateSatisfied({ decisions: [decision(false), decision(false)], stopHookResponses: [BLOCKED, BLOCKED] })).toBe(false);
  });

  it('rejects a passing decision appended without a matching stop response', () => {
    expect(
      gateSatisfied({ decisions: [decision(false), decision(true)], stopHookResponses: [BLOCKED] }),
    ).toBe(false);
  });

  it('rejects a decision log rewritten to pass while the stream shows the stop was blocked', () => {
    expect(gateSatisfied({ decisions: [decision(true)], stopHookResponses: [BLOCKED] })).toBe(false);
  });

  it('rejects a released stop that the gate never recorded, as when the hook crashed', () => {
    expect(gateSatisfied({ decisions: [], stopHookResponses: [RELEASED] })).toBe(false);
  });
});

describe('decideOutcome', () => {
  it('accepts a successful run whose gate passed last', () => {
    expect(decideOutcome(COMPLETED)).toBe('success');
  });

  it('reports a timeout or an abort whatever the stream said', () => {
    expect(decideOutcome({ ...COMPLETED, termination: 'timeout' })).toBe('timeout');
    expect(decideOutcome({ ...COMPLETED, termination: 'aborted' })).toBe('aborted');
  });

  it('treats a run without a result line as an error', () => {
    expect(decideOutcome({ ...COMPLETED, result: null })).toBe('error');
  });

  it('refuses success when the gate is not satisfied', () => {
    expect(decideOutcome({ ...COMPLETED, gate: { decisions: [], stopHookResponses: [] } })).toBe('error');
  });

  it('does not require gate evidence when the run has no gate', () => {
    expect(decideOutcome({ ...COMPLETED, gateRequired: false, gate: { decisions: [], stopHookResponses: [] } })).toBe(
      'success',
    );
  });

  it('keeps limit outcomes even when the gate did not pass', () => {
    expect(
      decideOutcome({ ...COMPLETED, result: result('error_max_turns', true), gate: { decisions: [], stopHookResponses: [] } }),
    ).toBe('max-turns');
  });

  it('reports a decision request when the last stop was let through for one', () => {
    expect(decideOutcome({ ...COMPLETED, gate: { decisions: [decision(false), requested()], stopHookResponses: [BLOCKED, RELEASED] } })).toBe(
      'decision-requested',
    );
  });

  it('treats a decision request the stream shows as blocked as an error', () => {
    expect(decideOutcome({ ...COMPLETED, gate: { decisions: [requested()], stopHookResponses: [BLOCKED] } })).toBe('error');
  });

  it('treats tampered run files as an error', () => {
    expect(decideOutcome({ ...COMPLETED, tamperedRunFiles: ['/runs/run-1/settings.json'] })).toBe('error');
  });
});

describe('decisionRequested', () => {
  it('requires the last decision to be a request matching the last released stop', () => {
    expect(decisionRequested({ decisions: [requested()], stopHookResponses: [RELEASED] })).toBe(true);
    expect(decisionRequested({ decisions: [requested(), decision(false)], stopHookResponses: [RELEASED, BLOCKED] })).toBe(false);
    expect(decisionRequested({ decisions: [requested()], stopHookResponses: [] })).toBe(false);
  });
});

describe('gateBlocksOf', () => {
  it('counts the gate decisions that refused the stop', () => {
    expect(gateBlocksOf([])).toBe(0);
    expect(gateBlocksOf([decision(false), decision(false), decision(true)])).toBe(2);
  });

  it('does not count a stop let through for a decision request', () => {
    expect(gateBlocksOf([decision(false), requested()])).toBe(1);
  });
});
