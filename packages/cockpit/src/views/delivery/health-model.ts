import type { HealthSample } from '../../contract/index.ts';
import type { StatusMark } from '../../model/status.ts';

export interface LatencyRange {
  readonly fastestMs: number;
  readonly slowestMs: number;
}

export interface SeriesSummary {
  readonly total: number;
  readonly passing: number;
  readonly failing: number;
  /** The range of the latencies measured; null when no sample carries one. */
  readonly latency: LatencyRange | null;
}

export interface LatencyPoint {
  readonly at: string;
  readonly latencyMs: number;
}

/** One cell of the strip that shows the last day: a sample, or a run of consecutive samples when the day holds more than the strip can show. */
export interface TimelineCell {
  readonly from: string;
  readonly to: string;
  readonly passing: number;
  readonly failing: number;
}

export const MAX_TIMELINE_CELLS = 48;
const MIN_SAMPLES_PER_CELL = 1;

export function sampleMark(sample: Pick<HealthSample, 'ok'>): StatusMark {
  return sample.ok ? 'success' : 'failed';
}

/** The samples that measured a latency: a probe that got no answer has none, and is not drawn as zero. */
export function latencyPoints(series: readonly HealthSample[]): readonly LatencyPoint[] {
  return series.flatMap((sample) => (sample.latencyMs === null ? [] : [{ at: sample.at, latencyMs: sample.latencyMs }]));
}

/** The samples in order, grouped so that there are at most `maxCells` cells; a cell fails as soon as one of its samples did. */
export function timelineCells(series: readonly HealthSample[], maxCells: number = MAX_TIMELINE_CELLS): readonly TimelineCell[] {
  const size = Math.max(MIN_SAMPLES_PER_CELL, Math.ceil(series.length / maxCells));
  const groups = Array.from({ length: Math.ceil(series.length / size) }, (_, index) => series.slice(index * size, (index + 1) * size));
  return groups.flatMap((group) => {
    const first = group[0];
    const last = group.at(-1);
    if (first === undefined || last === undefined) return [];
    const failing = group.filter((sample) => !sample.ok).length;
    return [{ from: first.at, to: last.at, passing: group.length - failing, failing }];
  });
}

export function summarizeSeries(series: readonly HealthSample[]): SeriesSummary {
  const latencies = latencyPoints(series).map((point) => point.latencyMs);
  const passing = series.filter((sample) => sample.ok).length;
  return {
    total: series.length,
    passing,
    failing: series.length - passing,
    latency: latencies.length === 0 ? null : { fastestMs: Math.min(...latencies), slowestMs: Math.max(...latencies) },
  };
}
