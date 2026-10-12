import { addTokenUsage, NO_TOKENS, type TokenUsage } from '@agent-factory/domain';
import type { CostEntry, CostsView, DailyCost, RunView } from '../../contract/index.ts';
import { PER_RUN_CAP_USD } from './roles.ts';
import type { RunWorld } from './runs.ts';
import type { FixtureClock } from './time.ts';
import { tokenTotals } from './token-model.ts';

const DAILY_WINDOW_DAYS = 14;
const COST_DECIMALS = 10_000;
const MONTH_PREFIX_LENGTH = 7;
const DATE_LENGTH = 10;

interface Tally {
  readonly costUsd: number;
  readonly runs: number;
  readonly usage: TokenUsage;
}

const EMPTY_TALLY: Tally = { costUsd: 0, runs: 0, usage: NO_TOKENS };

function rounded(value: number): number {
  return Math.round(value * COST_DECIMALS) / COST_DECIMALS;
}

function tally(runs: readonly RunView[]): Tally {
  return runs.reduce<Tally>((sum, run) => ({ costUsd: sum.costUsd + run.costUsd, runs: sum.runs + 1, usage: addTokenUsage(sum.usage, run.usage) }), EMPTY_TALLY);
}

function entry(key: string, runs: readonly RunView[]): CostEntry {
  const total = tally(runs);
  return { key, costUsd: rounded(total.costUsd), runs: total.runs, tokens: tokenTotals(total.usage) };
}

function dayOf(run: RunView): string {
  return run.startedAt.slice(0, DATE_LENGTH);
}

function groupedBy(runs: readonly RunView[], keyOf: (run: RunView) => string | null): Map<string, RunView[]> {
  const groups = new Map<string, RunView[]>();
  for (const run of runs) {
    const key = keyOf(run);
    if (key === null) continue;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return groups;
}

function byCostDescending<Item extends CostEntry>(entries: readonly Item[]): Item[] {
  return [...entries].sort((left, right) => right.costUsd - left.costUsd || left.key.localeCompare(right.key));
}

/** Every figure is worked out from the runs of the world. */
export function costsView(clock: FixtureClock, world: RunWorld): CostsView {
  const runs = world.runs;
  const dates = Array.from({ length: DAILY_WINDOW_DAYS }, (_, index) => clock.dateDaysAgo(DAILY_WINDOW_DAYS - 1 - index));
  const byDay = groupedBy(runs, dayOf);
  const daily: DailyCost[] = dates.map((date) => {
    const total = tally(byDay.get(date) ?? []);
    return { date, costUsd: rounded(total.costUsd), runs: total.runs, tokens: tokenTotals(total.usage) };
  });
  const today = daily.at(-1);
  if (today === undefined) throw new Error('the daily series is empty');
  const month = today.date.slice(0, MONTH_PREFIX_LENGTH);
  const thisMonth = runs.filter((run) => dayOf(run).startsWith(month));
  const issueRuns = groupedBy(runs, (run) => (run.project !== null && run.subject.kind === 'issue' ? `${run.project}/${run.subject.id}` : null));
  return {
    basis: 'subscription-equivalent',
    today: { date: today.date, costUsd: today.costUsd, runs: today.runs },
    monthToDateUsd: rounded(tally(thisMonth).costUsd),
    dailyCap: { kind: 'none' },
    perRunCapUsd: PER_RUN_CAP_USD,
    tokens: tokenTotals(tally(runs).usage),
    daily,
    byProject: byCostDescending([...groupedBy(runs, (run) => run.project).entries()].map(([key, group]) => entry(key, group))),
    byRole: byCostDescending([...groupedBy(runs, (run) => run.role).entries()].map(([key, group]) => entry(key, group))),
    byModel: byCostDescending([...groupedBy(runs, (run) => run.model).entries()].map(([key, group]) => entry(key, group))),
    byIssue: byCostDescending(
      [...issueRuns.entries()].map(([key, group]) => {
        const [project = '', number = '0'] = key.split('/');
        return { ...entry(key, group), project, issueNumber: Number(number) };
      }),
    ),
  };
}
