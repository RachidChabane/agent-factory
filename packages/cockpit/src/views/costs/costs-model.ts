import type { CostCaps, DailyCost, RunView } from '../../contract/index.ts';
import { toEpoch } from '../../format/format.ts';

export const SUBSCRIPTION_SUCCESS_BELOW = 0.75;
export const SUBSCRIPTION_RUNNING_BELOW = 0.9;
export const PERCENT_SCALE = 100;
export const MIN_PAUSE_PERCENT = 1;
export const MAX_PAUSE_PERCENT = 100;
export const PAUSE_PERCENT_DIGITS = 2;
export const COST_CHART_HEIGHT = 168;

export type UtilizationTone = 'success' | 'running' | 'failed';

export function utilizationTone(utilization: number): UtilizationTone {
  if (utilization < SUBSCRIPTION_SUCCESS_BELOW) return 'success';
  if (utilization < SUBSCRIPTION_RUNNING_BELOW) return 'running';
  return 'failed';
}

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

export function axisDates(daily: readonly DailyCost[]): readonly string[] {
  const first = daily.at(0);
  const middle = daily[Math.floor((daily.length - 1) / 2)];
  const last = daily.at(-1);
  return [first, middle, last].flatMap((day) => (day === undefined ? [] : [day.date]));
}

export function runsByCost(runs: readonly RunView[]): readonly RunView[] {
  return runs.toSorted((a, b) => b.costUsd - a.costUsd);
}

export function runDurationMs(run: RunView, now: number): number {
  return (run.endedAt === null ? now : toEpoch(run.endedAt)) - toEpoch(run.startedAt);
}

export interface CapsDraft {
  readonly dailyUsd: string;
  readonly perRunUsd: string;
  readonly pausePercent: string;
}

export type CapsField = keyof CapsDraft;
export type CapsErrors = Readonly<Record<CapsField, string | null>>;

export interface CapsParsing {
  readonly errors: CapsErrors;
  readonly caps: CostCaps | null;
}

export const POSITIVE_AMOUNT_ERROR = 'Saisissez un montant strictement positif.';
export const PAUSE_PERCENT_ERROR = `Saisissez un pourcentage entre ${MIN_PAUSE_PERCENT} et ${MAX_PAUSE_PERCENT}.`;

export function draftFromCaps(caps: CostCaps): CapsDraft {
  return {
    dailyUsd: String(caps.dailyUsd),
    perRunUsd: String(caps.perRunUsd),
    pausePercent: String(Number((caps.pauseAtUtilization * PERCENT_SCALE).toFixed(PAUSE_PERCENT_DIGITS))),
  };
}

export function sameDraft(a: CapsDraft, b: CapsDraft): boolean {
  return a.dailyUsd === b.dailyUsd && a.perRunUsd === b.perRunUsd && a.pausePercent === b.pausePercent;
}

function parseNumber(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text);
}

function isPositiveAmount(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isPausePercent(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_PAUSE_PERCENT && value <= MAX_PAUSE_PERCENT;
}

export function parseCaps(draft: CapsDraft): CapsParsing {
  const dailyUsd = parseNumber(draft.dailyUsd);
  const perRunUsd = parseNumber(draft.perRunUsd);
  const pausePercent = parseNumber(draft.pausePercent);
  const errors: CapsErrors = {
    dailyUsd: isPositiveAmount(dailyUsd) ? null : POSITIVE_AMOUNT_ERROR,
    perRunUsd: isPositiveAmount(perRunUsd) ? null : POSITIVE_AMOUNT_ERROR,
    pausePercent: isPausePercent(pausePercent) ? null : PAUSE_PERCENT_ERROR,
  };
  const valid = Object.values(errors).every((error) => error === null);
  return { errors, caps: valid ? { dailyUsd, perRunUsd, pauseAtUtilization: pausePercent / PERCENT_SCALE } : null };
}
