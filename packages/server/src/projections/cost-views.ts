import type { CostEntry, CostsView, DailyCost, TokenTotals } from '@agent-factory/cockpit';
import { addTokenUsage, costBasisOf, NO_TOKENS, tokensWithCache, tokensWithoutCache, type BillingMode, type DailyCap, type TokenUsage } from '@agent-factory/domain';
import type { RecordedRun } from './run-views.ts';

const ISSUE_SUBJECT_KIND = 'issue';
const DATE_LENGTH = 10;
const MONTH_LENGTH = 7;
const MIXED_BASIS = 'mixed';
export const DAILY_COST_DAYS = 30;
const MILLISECONDS_PER_DAY = 86_400_000;
const NO_PROJECT = 'installation';

interface Totals {
  costUsd: number;
  runs: number;
  usage: TokenUsage;
}

export interface CostSettings {
  readonly generatedAt: Date;
  readonly billing: readonly BillingMode[];
  readonly dailyCap: DailyCap;
  readonly perRunCapUsd: number | null;
}

function tokenTotals(usage: TokenUsage): TokenTotals {
  return {
    input: usage.inputTokens,
    output: usage.outputTokens,
    cacheRead: usage.cacheReadTokens,
    cacheCreation: usage.cacheCreationTokens,
    withoutCache: tokensWithoutCache(usage),
    withCache: tokensWithCache(usage),
  };
}

function add(map: Map<string, Totals>, key: string, run: RecordedRun): void {
  const finished = run.finished;
  if (finished === null) return;
  const totals = map.get(key) ?? { costUsd: 0, runs: 0, usage: NO_TOKENS };
  map.set(key, { costUsd: totals.costUsd + finished.costUsd, runs: totals.runs + 1, usage: addTokenUsage(totals.usage, finished.usage) });
}

function entries(map: ReadonlyMap<string, Totals>): CostEntry[] {
  return [...map]
    .map(([key, totals]) => ({ key, costUsd: totals.costUsd, runs: totals.runs, tokens: tokenTotals(totals.usage) }))
    .sort((left, right) => right.costUsd - left.costUsd || left.key.localeCompare(right.key));
}

function windowDays(now: Date): readonly string[] {
  return Array.from({ length: DAILY_COST_DAYS }, (_, offset) =>
    new Date(now.getTime() - (DAILY_COST_DAYS - 1 - offset) * MILLISECONDS_PER_DAY).toISOString().slice(0, DATE_LENGTH),
  );
}

/** Subscription accounts report the API price of their usage; API-key accounts report what is charged. */
export function costBasis(billing: readonly BillingMode[]): CostsView['basis'] {
  const bases = new Set(billing.map(costBasisOf));
  if (bases.size === 0) return costBasisOf('subscription');
  if (bases.size > 1) return MIXED_BASIS;
  return [...bases][0] ?? costBasisOf('subscription');
}

/** What the agent runs of every project cost, by day, project, role, model and issue. */
export function projectCosts(runs: readonly RecordedRun[], settings: CostSettings): CostsView {
  const { generatedAt } = settings;
  const byDay = new Map<string, Totals>();
  const byProject = new Map<string, Totals>();
  const byRole = new Map<string, Totals>();
  const byModel = new Map<string, Totals>();
  const byIssue = new Map<string, Totals>();
  const everything = new Map<string, Totals>();
  const today = generatedAt.toISOString().slice(0, DATE_LENGTH);
  const month = generatedAt.toISOString().slice(0, MONTH_LENGTH);
  const oldestDay = windowDays(generatedAt)[0] ?? today;
  let monthToDateUsd = 0;
  for (const run of runs) {
    if (run.finished === null) continue;
    const day = run.finished.endedAt.slice(0, DATE_LENGTH);
    if (day.startsWith(month)) monthToDateUsd += run.finished.costUsd;
    if (day >= oldestDay) add(byDay, day, run);
    add(everything, '', run);
    add(byProject, run.started.project ?? NO_PROJECT, run);
    add(byRole, run.started.role, run);
    add(byModel, run.started.model, run);
    if (run.started.subject.kind === ISSUE_SUBJECT_KIND && run.started.project !== null) add(byIssue, `${run.started.project}#${run.started.subject.id}`, run);
  }
  const todayTotals = byDay.get(today);
  const daily: DailyCost[] = windowDays(generatedAt).map((date) => {
    const totals = byDay.get(date);
    return { date, costUsd: totals?.costUsd ?? 0, runs: totals?.runs ?? 0, tokens: tokenTotals(totals?.usage ?? NO_TOKENS) };
  });
  return {
    basis: costBasis(settings.billing),
    today: { date: today, costUsd: todayTotals?.costUsd ?? 0, runs: todayTotals?.runs ?? 0 },
    monthToDateUsd,
    dailyCap: settings.dailyCap,
    perRunCapUsd: settings.perRunCapUsd,
    tokens: tokenTotals(everything.get('')?.usage ?? NO_TOKENS),
    daily,
    byProject: entries(byProject),
    byRole: entries(byRole),
    byModel: entries(byModel),
    byIssue: entries(byIssue).flatMap((entry) => {
      const separator = entry.key.lastIndexOf('#');
      const issueNumber = Number(entry.key.slice(separator + 1));
      return Number.isInteger(issueNumber) && issueNumber > 0 ? [{ ...entry, project: entry.key.slice(0, separator), issueNumber }] : [];
    }),
  };
}

/** What each issue of one project cost, summed over its agent runs. */
export function issueCosts(runs: readonly RecordedRun[], project: string): ReadonlyMap<number, number> {
  const costs = new Map<number, number>();
  for (const run of runs) {
    if (run.started.project !== project || run.started.subject.kind !== ISSUE_SUBJECT_KIND) continue;
    const issueNumber = Number(run.started.subject.id);
    const cost = run.finished?.costUsd ?? run.started.costUsd;
    costs.set(issueNumber, (costs.get(issueNumber) ?? 0) + cost);
  }
  return costs;
}
