import { describe, expect, it } from 'vitest';
import type { SkillEvalCase } from './skill-eval-gate.ts';
import { evaluateSkillEval } from './skill-eval-gate.ts';

function evalCase(caseId: string, targeted: boolean, base: number[], branch: number[]): SkillEvalCase {
  return { caseId, targeted, baseScores: base, branchScores: branch };
}

describe('skill eval gate', () => {
  it('passes with a sufficient targeted delta and no regression', () => {
    const verdict = evaluateSkillEval([
      evalCase('t1', true, [0.2, 0.4], [0.7, 0.9]),
      evalCase('o1', false, [0.8, 0.8], [0.8, 0.78]),
    ]);
    expect(verdict.passed).toBe(true);
    expect(verdict.targetedDelta).toBeCloseTo(0.5);
  });

  it('fails when the targeted delta is below the minimum', () => {
    const verdict = evaluateSkillEval([evalCase('t1', true, [0.5], [0.52])]);
    expect(verdict.passed).toBe(false);
    expect(verdict.reasons[0]).toContain('below the minimum');
  });

  it('fails when an untargeted case regresses beyond tolerance', () => {
    const verdict = evaluateSkillEval([evalCase('t1', true, [0.1], [0.9]), evalCase('o1', false, [0.9], [0.7])]);
    expect(verdict.passed).toBe(false);
    expect(verdict.regressions.map((r) => r.caseId)).toEqual(['o1']);
  });

  it('honours custom thresholds', () => {
    const cases = [evalCase('t1', true, [0.5], [0.55]), evalCase('o1', false, [0.9], [0.8])];
    expect(evaluateSkillEval(cases).passed).toBe(false);
    expect(evaluateSkillEval(cases, { minimumTargetedDelta: 0.01, regressionTolerance: 0.2 }).passed).toBe(true);
  });

  it('fails when there is no targeted case or a case has no scores', () => {
    expect(evaluateSkillEval([evalCase('o1', false, [1], [1])]).passed).toBe(false);
    expect(evaluateSkillEval([evalCase('t1', true, [], [1])]).passed).toBe(false);
  });
});
