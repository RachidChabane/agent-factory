import type { AgentRole } from '@agent-factory/domain';
import { AGENT_ROLES } from '@agent-factory/domain';
import type { CostEntry, DailyCapView, DailyCost } from '../../contract/index.ts';

export interface DailySummary {
  readonly totalUsd: number;
  readonly averageUsd: number;
  readonly runs: number;
}

export function summarizeDaily(daily: readonly DailyCost[]): DailySummary {
  const totalUsd = daily.reduce((sum, day) => sum + day.costUsd, 0);
  return {
    totalUsd,
    averageUsd: daily.length === 0 ? 0 : totalUsd / daily.length,
    runs: daily.reduce((sum, day) => sum + day.runs, 0),
  };
}

/** The days labelled under the chart: the first, the middle and the last, each once. */
export function axisDates(daily: readonly DailyCost[]): readonly string[] {
  if (daily.length === 0) return [];
  const positions = new Set([0, Math.floor((daily.length - 1) / 2), daily.length - 1]);
  return [...positions].flatMap((position) => {
    const day = daily[position];
    return day === undefined ? [] : [day.date];
  });
}

/** Whether the last bar of the chart is the day of the cost figure of today. */
export function endsOnDay(daily: readonly DailyCost[], date: string): boolean {
  return daily.at(-1)?.date === date;
}

/** The daily cap as an amount, or null when the installation sets none. */
export function dailyCapAmount(cap: DailyCapView): number | null {
  return cap.kind === 'usd' ? cap.amount : null;
}

/** The role a cost group key stands for, or null when the key is not a role. */
export function roleOfKey(key: string): AgentRole | null {
  return AGENT_ROLES.find((role) => role === key) ?? null;
}

export function byCostDescending<Entry extends Pick<CostEntry, 'costUsd'>>(entries: readonly Entry[]): readonly Entry[] {
  return entries.toSorted((left, right) => right.costUsd - left.costUsd);
}

/** The length of an entry's bar, from 0 to 1, relative to the most expensive entry of its group. */
export function shareOfLargest(costUsd: number, entries: readonly Pick<CostEntry, 'costUsd'>[]): number {
  const largest = Math.max(0, ...entries.map((entry) => entry.costUsd));
  return largest > 0 ? costUsd / largest : 0;
}
