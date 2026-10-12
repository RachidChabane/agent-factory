import { describe, expect, it } from 'vitest';
import { isBlockedStop, isDecisionRequest, parseGateDecisionLog, type GateDecision } from './gate-decision.ts';

function decision(passed: boolean, failure: GateDecision['failure']): GateDecision {
  return { decidedAt: '2026-10-10T00:00:00.000Z', sessionId: 'session', stopHookActive: false, passed, failure, durationMs: 1, steps: [] };
}

describe('gate decisions', () => {
  it('counts a failed or unavailable gate as a blocked stop', () => {
    expect(isBlockedStop(decision(false, 'gate-failed'))).toBe(true);
    expect(isBlockedStop(decision(false, 'gate-unavailable'))).toBe(true);
    expect(isBlockedStop(decision(true, null))).toBe(false);
  });

  it('lets a decision request through as a stop that is neither passed nor blocked', () => {
    const requested = decision(false, 'decision-requested');

    expect(isDecisionRequest(requested)).toBe(true);
    expect(isBlockedStop(requested)).toBe(false);
    expect(isDecisionRequest(decision(false, 'gate-failed'))).toBe(false);
  });

  it('parses a decision log line by line', () => {
    const log = `${JSON.stringify(decision(false, 'gate-failed'))}\n\n${JSON.stringify(decision(false, 'decision-requested'))}\n`;

    expect(parseGateDecisionLog(log).map((entry) => entry.failure)).toEqual(['gate-failed', 'decision-requested']);
  });
});
