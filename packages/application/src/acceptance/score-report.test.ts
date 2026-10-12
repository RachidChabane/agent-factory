import { describe, expect, it } from 'vitest';
import { readScoreReport, skillEvalCases, targetedScore } from './score-report.ts';

const BASE = { cases: [{ id: 'greets', targeted: true, scores: [0.2, 0.4] }, { id: 'refuses', targeted: false, scores: [1] }] };
const BRANCH = { cases: [{ id: 'greets', targeted: true, scores: [0.8] }, { id: 'new-case', targeted: false, scores: [1] }] };

describe('score report', () => {
  it('reads a valid report and reports missing or malformed ones', () => {
    expect(readScoreReport('out/score.json', JSON.stringify(BASE))).toEqual({ valid: true, report: BASE });
    expect(readScoreReport('out/score.json', null)).toEqual({ valid: false, problem: 'score output out/score.json was not written' });
    expect(readScoreReport('out/score.json', '{"cases":[]}').valid).toBe(false);
  });

  it('scores the targeted cases', () => {
    expect(targetedScore(BASE)).toBeCloseTo(0.3);
    expect(targetedScore({ cases: [{ id: 'x', targeted: false, scores: [1] }] })).toBeNull();
  });

  it('pairs base and branch scores by case', () => {
    expect(skillEvalCases(BASE, BRANCH)).toEqual([
      { caseId: 'greets', targeted: true, baseScores: [0.2, 0.4], branchScores: [0.8] },
      { caseId: 'refuses', targeted: false, baseScores: [1], branchScores: [] },
      { caseId: 'new-case', targeted: false, baseScores: [], branchScores: [1] },
    ]);
  });
});
