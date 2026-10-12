import type { CostsView } from '@agent-factory/cockpit';
import { AGENT_ROLES } from '@agent-factory/domain';
import type { TokenUsage } from '@agent-factory/domain';
import type { RecordedRun } from './run-views.ts';
import type { SnapshotContext } from './snapshot-context.ts';

const ISSUE_SUBJECT_KIND = 'issue';
const DATE_LENGTH = 10;
const MONTH_LENGTH = 7;
export const DAILY_COST_DAYS = 30;
const MILLISECONDS_PER_DAY = 86_400_000;

interface Totals {
  costUsd: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  runs: number;
}

const EMPTY_TOTALS: Readonly<Totals> = { costUsd: 0, tokens: 0, inputTokens: 0, outputTokens: 0, runs: 0 };

function windowDays(now: Date): readonly string[] {
  return Array.from({ length: DAILY_COST_DAYS }, (_, offset) =>
    new Date(now.getTime() - (DAILY_COST_DAYS - 1 - offset) * MILLISECONDS_PER_DAY).toISOString().slice(0, DATE_LENGTH),
  );
}

function tokensOf(usage: TokenUsage): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens;
}

function add(map: Map<string, Totals>, key: string, run: RecordedRun): void {
  const finished = run.finished;
  if (finished === null) return;
  const totals = map.get(key) ?? { costUsd: 0, tokens: 0, inputTokens: 0, outputTokens: 0, runs: 0 };
  totals.costUsd += finished.costUsd;
  totals.tokens += tokensOf(finished.usage);
  totals.inputTokens += finished.usage.inputTokens;
  totals.outputTokens += finished.usage.outputTokens;
  totals.runs += 1;
  map.set(key, totals);
}

export function projectCosts(runs: readonly RecordedRun[], context: SnapshotContext): CostsView {
  const byDay = new Map<string, Totals>();
  const byRole = new Map<string, Totals>();
  const byModel = new Map<string, Totals>();
  const byIssue = new Map<string, Totals>();
  const month = context.generatedAt.toISOString().slice(0, MONTH_LENGTH);
  const oldestDay = new Date(context.generatedAt.getTime() - (DAILY_COST_DAYS - 1) * MILLISECONDS_PER_DAY).toISOString().slice(0, DATE_LENGTH);
  let monthToDateUsd = 0;
  for (const run of runs) {
    if (run.finished === null) continue;
    const day = run.finished.endedAt.slice(0, DATE_LENGTH);
    if (day.startsWith(month)) monthToDateUsd += run.finished.costUsd;
    if (day >= oldestDay) add(byDay, day, run);
    add(byRole, run.started.role, run);
    add(byModel, run.started.model, run);
    if (run.started.subject.kind === ISSUE_SUBJECT_KIND) add(byIssue, run.started.subject.id, run);
  }
  return {
    monthToDateUsd,
    daily: windowDays(context.generatedAt).map((date) => {
      const totals = byDay.get(date) ?? EMPTY_TOTALS;
      return { date, costUsd: totals.costUsd, inputTokens: totals.inputTokens, outputTokens: totals.outputTokens, runs: totals.runs };
    }),
    byRole: AGENT_ROLES.flatMap((role) => {
      const totals = byRole.get(role);
      return totals === undefined ? [] : [{ role, costUsd: totals.costUsd, tokens: totals.tokens, runs: totals.runs }];
    }),
    byModel: [...byModel].map(([key, totals]) => ({ key, costUsd: totals.costUsd, tokens: totals.tokens, runs: totals.runs })),
    byIssue: [...byIssue]
      .map(([key, totals]) => ({ issueNumber: Number(key), costUsd: totals.costUsd, tokens: totals.tokens, runs: totals.runs }))
      .filter((entry) => Number.isInteger(entry.issueNumber) && entry.issueNumber > 0)
      .sort((left, right) => left.issueNumber - right.issueNumber),
    subscription: [...context.subscription],
    caps: {
      dailyUsd: context.dailyCapUsd,
      perRunUsd: context.perRunCapUsd ?? Math.max(0, ...context.roles.map((role) => role.maxBudgetUsd)),
      pauseAtUtilization: context.pauseAtUtilization,
    },
  };
}
