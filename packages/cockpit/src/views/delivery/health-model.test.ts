import { describe, expect, it } from 'vitest';
import type { HealthSample } from '../../contract/index.ts';
import { latencyPoints, MAX_TIMELINE_CELLS, sampleMark, summarizeSeries, timelineCells } from './health-model.ts';

const sample = (hour: number, patch: Partial<HealthSample> = {}): HealthSample => ({
  at: `2026-10-12T${String(hour).padStart(2, '0')}:00:00.000Z`,
  ok: true,
  statusCode: 200,
  latencyMs: 120,
  detail: '200 OK',
  ...patch,
});
const REFUSED = { ok: false, statusCode: null, latencyMs: null, detail: 'Connection refused' } as const;

describe('sampleMark', () => {
  it('marks a passing sample as a success and a failing one as a failure', () => {
    expect(sampleMark(sample(1))).toBe('success');
    expect(sampleMark(sample(1, REFUSED))).toBe('failed');
  });
});

describe('latencyPoints', () => {
  it('keeps the samples that measured a latency, in order, and leaves out those that got no answer', () => {
    const series = [sample(1, { latencyMs: 100 }), sample(2, REFUSED), sample(3, { ok: false, statusCode: 503, latencyMs: 5_000 })];
    expect(latencyPoints(series)).toEqual([
      { at: series[0]?.at, latencyMs: 100 },
      { at: series[2]?.at, latencyMs: 5_000 },
    ]);
  });

  it('keeps a latency of zero: it was measured', () => {
    expect(latencyPoints([sample(1, { latencyMs: 0 })])).toHaveLength(1);
  });

  it('is empty for an empty series', () => {
    expect(latencyPoints([])).toEqual([]);
  });
});

describe('summarizeSeries', () => {
  it('counts the samples that passed and failed, and gives the range of the latencies', () => {
    const series = [sample(1, { latencyMs: 80 }), sample(2, { ok: false, statusCode: 503, latencyMs: 5_000 }), sample(3, { latencyMs: 200 }), sample(4, REFUSED)];
    expect(summarizeSeries(series)).toEqual({ total: 4, passing: 2, failing: 2, latency: { fastestMs: 80, slowestMs: 5_000 } });
  });

  it('has no latency range when no probe got an answer', () => {
    expect(summarizeSeries([sample(1, REFUSED), sample(2, REFUSED)])).toEqual({ total: 2, passing: 0, failing: 2, latency: null });
  });

  it('summarizes an empty series as nothing', () => {
    expect(summarizeSeries([])).toEqual({ total: 0, passing: 0, failing: 0, latency: null });
  });
});

describe('timelineCells', () => {
  it('draws one cell per sample while the day holds no more than the strip can show', () => {
    const series = [sample(1), sample(2, REFUSED), sample(3)];
    expect(timelineCells(series)).toEqual([
      { from: series[0]?.at, to: series[0]?.at, passing: 1, failing: 0 },
      { from: series[1]?.at, to: series[1]?.at, passing: 0, failing: 1 },
      { from: series[2]?.at, to: series[2]?.at, passing: 1, failing: 0 },
    ]);
  });

  it('groups consecutive samples so that a busy day fits the strip, and fails a group as soon as one sample failed', () => {
    const series = Array.from({ length: 288 }, (_, index) => ({ ...sample(0), at: new Date(Date.UTC(2026, 9, 11, 10) + index * 300_000).toISOString(), ok: index !== 100 }));
    const cells = timelineCells(series);
    expect(cells).toHaveLength(MAX_TIMELINE_CELLS);
    expect(cells.reduce((total, cell) => total + cell.passing + cell.failing, 0)).toBe(288);
    expect(cells.filter((cell) => cell.failing > 0)).toEqual([{ from: series[96]?.at, to: series[101]?.at, passing: 5, failing: 1 }]);
    expect(cells[0]?.from).toBe(series[0]?.at);
    expect(cells.at(-1)?.to).toBe(series.at(-1)?.at);
  });

  it('keeps the remainder in a last, smaller cell', () => {
    const series = Array.from({ length: 7 }, (_, index) => sample(index + 1));
    const cells = timelineCells(series, 3);
    expect(cells.map((cell) => cell.passing)).toEqual([3, 3, 1]);
  });

  it('draws nothing for a day without a sample', () => {
    expect(timelineCells([])).toEqual([]);
  });
});
