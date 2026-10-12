import { describe, expect, it } from 'vitest';
import type { EvalCaseScore } from '../../contract/index.ts';
import { criterionGroups, isMediaEvidence, measuredSize, runCounts, scoreDirection, scoreWidthPercent, summarizeEval } from './evidence-model.ts';

const evalCase = (caseId: string, targeted: boolean, baseScore: number, branchScore: number): EvalCaseScore => ({ caseId, label: `Case ${caseId}`, targeted, baseScore, branchScore });

describe('criterionGroups', () => {
  const row = (criterion: number, name: string) => ({ criterion, test: 'tests/a.test.ts', name, base: 'red-assertion', branch: 'green' }) as const;

  it('groups the tests under their criterion in numeric order, with the wording of each', () => {
    const groups = criterionGroups({
      criteria: [
        { criterion: 2, text: 'Second' },
        { criterion: 1, text: 'First' },
      ],
      rows: [row(2, 'b'), row(1, 'a'), row(2, 'c')],
    });
    expect(groups.map((group) => [group.criterion, group.text, group.rows.map((entry) => entry.name)])).toEqual([
      [1, 'First', ['a']],
      [2, 'Second', ['b', 'c']],
    ]);
  });

  it('keeps a criterion that no test covers, with no row', () => {
    const groups = criterionGroups({ criteria: [{ criterion: 1, text: 'First' }, { criterion: 2, text: 'Second' }], rows: [row(1, 'a')] });
    expect(groups.find((group) => group.criterion === 2)).toEqual({ criterion: 2, text: 'Second', rows: [] });
  });

  it('keeps a test whose criterion has no wording, and leaves the wording unknown', () => {
    const groups = criterionGroups({ criteria: [], rows: [row(3, 'a')] });
    expect(groups).toEqual([{ criterion: 3, text: null, rows: [row(3, 'a')] }]);
  });
});

describe('run counts', () => {
  it('states failures first and leaves out what is zero', () => {
    expect(runCounts({ failed: 2, passed: 5, skipped: 0 })).toEqual([
      { kind: 'failed', count: 2 },
      { kind: 'passed', count: 5 },
    ]);
  });

  it('is empty when no test ran', () => {
    expect(runCounts({ failed: 0, passed: 0, skipped: 0 })).toEqual([]);
  });
});

describe('scores', () => {
  it('reads the direction of a change as it looks once rounded to two decimals', () => {
    expect(scoreDirection(0.25)).toBe('up');
    expect(scoreDirection(-0.25)).toBe('down');
    expect(scoreDirection(0)).toBe('flat');
    expect(scoreDirection(0.004)).toBe('flat');
    expect(scoreDirection(-0.004)).toBe('flat');
  });

  it('keeps the width of a bar inside its track', () => {
    expect(scoreWidthPercent(0.5)).toBe(50);
    expect(scoreWidthPercent(1)).toBe(100);
    expect(scoreWidthPercent(1.4)).toBe(100);
    expect(scoreWidthPercent(-0.2)).toBe(0);
  });
});

describe('summarizeEval', () => {
  const thresholds = { minimumDelta: 0.1, regressionTolerance: 0.05 };

  it('passes when the targeted cases gain enough and no other case regresses', () => {
    const summary = summarizeEval({ ...thresholds, cases: [evalCase('a', true, 0.4, 1), evalCase('b', false, 1, 1)] });
    expect(summary).toMatchObject({ passed: true, regressions: 0 });
    expect(summary.targetedDelta).toBeCloseTo(0.6);
  });

  it('fails and flags the case that regressed beyond the tolerance', () => {
    const summary = summarizeEval({ ...thresholds, cases: [evalCase('a', true, 0.4, 1), evalCase('b', false, 1, 0.8), evalCase('c', false, 1, 0.97)] });
    expect(summary.passed).toBe(false);
    expect(summary.regressions).toBe(1);
    expect(summary.cases.filter((entry) => entry.regression).map((entry) => entry.entry.caseId)).toEqual(['b']);
  });

  it('fails when the gain on the targeted cases is below the minimum', () => {
    expect(summarizeEval({ ...thresholds, cases: [evalCase('a', true, 0.5, 0.55)] }).passed).toBe(false);
  });

  it('has no targeted gain, and fails, when no case is targeted', () => {
    const summary = summarizeEval({ ...thresholds, cases: [evalCase('a', false, 1, 1)] });
    expect(summary).toMatchObject({ passed: false, targetedDelta: null });
  });

  it('names a case by what it checks, or by its identifier when the evaluation names none', () => {
    const named = evalCase('named', true, 0, 1);
    const unnamed: EvalCaseScore = { ...evalCase('unnamed', true, 0, 1), label: null };
    expect(summarizeEval({ ...thresholds, cases: [named, unnamed] }).cases.map((row) => row.name)).toEqual(['Case named', 'unnamed']);
  });

  it('lists the targeted cases first and keeps the order of the report within each group', () => {
    const summary = summarizeEval({ ...thresholds, cases: [evalCase('x', false, 1, 1), evalCase('a', true, 0, 1), evalCase('y', false, 1, 1), evalCase('b', true, 0, 1)] });
    expect(summary.cases.map((entry) => entry.entry.caseId)).toEqual(['a', 'b', 'x', 'y']);
  });
});

describe('evidence helpers', () => {
  it('gives the size of an image the factory could measure', () => {
    expect(measuredSize({ width: 1280, height: 800 })).toEqual({ width: 1280, height: 800 });
  });

  it('gives no size for an image whose file could not be read as one', () => {
    expect(measuredSize({ width: null, height: null })).toBeNull();
    expect(measuredSize({ width: 1280, height: null })).toBeNull();
    expect(measuredSize({ width: null, height: 800 })).toBeNull();
  });

  it('gives no size for an image that declares an empty one', () => {
    expect(measuredSize({ width: 0, height: 0 })).toBeNull();
    expect(measuredSize({ width: 1280, height: 0 })).toBeNull();
  });

  it('recognises the media kinds', () => {
    expect(isMediaEvidence({ kind: 'report', id: 'r', title: 'Report', body: '' })).toBe(false);
    expect(isMediaEvidence({ kind: 'recording', id: 'v', title: 'Video', caption: '', url: '/v.webm', posterUrl: null, durationMs: 1 })).toBe(true);
  });
});
