import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AttemptHistory, EscalationProfile, RetryDecision } from './retry-policy.ts';
import { decideNextAttempt, MAX_FRESH_RESTARTS, MAX_IN_SESSION_CORRECTIONS } from './retry-policy.ts';

const ESCALATION: EscalationProfile = { model: 'opus', effort: 'high' };

describe('retry policy', () => {
  it('resumes the same session while corrections remain', () => {
    expect(decideNextAttempt({ inSessionCorrections: 0, freshRestarts: 0 }, ESCALATION)).toEqual({
      action: 'resume-same-session',
    });
    expect(decideNextAttempt({ inSessionCorrections: 1, freshRestarts: 0 }, ESCALATION).action).toBe(
      'resume-same-session',
    );
  });

  it('escalates once to a fresh session with the stronger profile', () => {
    expect(decideNextAttempt({ inSessionCorrections: 2, freshRestarts: 0 }, ESCALATION)).toEqual({
      action: 'fresh-session-escalated',
      profile: ESCALATION,
    });
  });

  it('asks for a human after the fresh session fails', () => {
    expect(decideNextAttempt({ inSessionCorrections: 2, freshRestarts: 1 }, ESCALATION)).toEqual({
      action: 'needs-human',
    });
  });
});

describe('retry policy (property)', () => {
  it('never exceeds the correction and restart budget before needs-human', () => {
    fc.assert(
      fc.property(fc.constantFrom('low', 'medium', 'high', 'xhigh', 'max'), fc.string(), (effort, model) => {
        let history: AttemptHistory = { inSessionCorrections: 0, freshRestarts: 0 };
        const actions: RetryDecision['action'][] = [];
        for (let step = 0; step < 10 && actions.at(-1) !== 'needs-human'; step += 1) {
          const decision = decideNextAttempt(history, { model, effort });
          actions.push(decision.action);
          if (decision.action === 'resume-same-session') {
            history = { ...history, inSessionCorrections: history.inSessionCorrections + 1 };
          } else if (decision.action === 'fresh-session-escalated') {
            history = { ...history, freshRestarts: history.freshRestarts + 1 };
          }
        }
        expect(actions.filter((a) => a === 'resume-same-session').length).toBe(MAX_IN_SESSION_CORRECTIONS);
        expect(actions.filter((a) => a === 'fresh-session-escalated').length).toBe(MAX_FRESH_RESTARTS);
        expect(actions.at(-1)).toBe('needs-human');
      }),
    );
  });

  it('always yields needs-human once a fresh restart was used', () => {
    fc.assert(
      fc.property(fc.nat(), fc.integer({ min: MAX_FRESH_RESTARTS, max: 50 }), (corrections, restarts) =>
        decideNextAttempt({ inSessionCorrections: corrections, freshRestarts: restarts }, ESCALATION).action === 'needs-human',
      ),
    );
  });
});
