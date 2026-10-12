import type { AlertSeverity, AlertState, EnvironmentName, PodStatus } from '../../contract/index.ts';
import { LOCALE, MINUTE_MS, SECOND_MS, toEpoch } from '../../format/format.ts';
import type { StatusMark } from '../../model/status.ts';
import type { BadgeTone } from '../../ui/components/Badge.tsx';
import type { ChartPoint } from '../../ui/components/Charts.tsx';

export const HEALTH_ENVIRONMENTS: readonly EnvironmentName[] = ['prod', 'prep'];
export const DEFAULT_HEALTH_ENVIRONMENT: EnvironmentName = 'prod';
export const TREND_LINE_HEIGHT = 56;

const METRIC_FRACTION_DIGITS = 2;

const metricFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: METRIC_FRACTION_DIGITS });
const clockFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

export function formatErrorRate(percentValue: number): string {
  return `${metricFormat.format(percentValue)} %`;
}

export function formatLatency(milliseconds: number): string {
  return `${metricFormat.format(milliseconds / SECOND_MS)} s`;
}

export function formatRatio(ratio: number): string {
  return `${metricFormat.format(ratio * 100)} %`;
}

export function chartPoints(values: readonly number[], sampledAt: string, intervalMinutes: number): readonly ChartPoint[] {
  const last = toEpoch(sampledAt);
  return values.map((value, index) => ({
    value,
    label: clockFormat.format(last - (values.length - 1 - index) * intervalMinutes * MINUTE_MS),
  }));
}

export function satisfactionRatio(positive: number, negative: number): number {
  const total = positive + negative;
  return total === 0 ? 0 : positive / total;
}

export const POD_MARKS: Readonly<Record<PodStatus, StatusMark>> = {
  running: 'success',
  pending: 'waiting',
  'crash-loop': 'failed',
  terminated: 'idle',
};

export const ALERT_TONES: Readonly<Record<AlertSeverity, BadgeTone>> = {
  critical: 'failed',
  warning: 'running',
  info: 'neutral',
};

const ALERT_STATE_RANK: Readonly<Record<AlertState, number>> = { triggered: 0, resolved: 1 };

export function sortAlerts<T extends { readonly status: AlertState; readonly triggeredAt: string }>(alerts: readonly T[]): readonly T[] {
  return alerts.toSorted(
    (a, b) => ALERT_STATE_RANK[a.status] - ALERT_STATE_RANK[b.status] || toEpoch(b.triggeredAt) - toEpoch(a.triggeredAt),
  );
}
