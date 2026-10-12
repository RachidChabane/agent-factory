import type { AgentRole } from '@agent-factory/domain';
import type { RunLogLine, RunView } from '../../contract/index.ts';
import { foldLog, type FoldedLog } from './log-fold.ts';
import { stampSteps } from './run-log-lines.ts';
import type { LoggedRunScript, RunSpec, TurnsRule } from './run-spec.ts';
import { LEDGER_RUN_SPECS } from './runs-ledger.ts';
import { STOREFRONT_RUN_SPECS } from './runs-storefront.ts';
import type { ScriptStep } from './script-builder.ts';
import { expiredPromoImplementer, searchSecondReview } from './scripts-finished.ts';
import { promoSavingsDecision, statusFilterImplementer } from './scripts-live.ts';
import { PER_RUN_CAP_USD, roleSetting } from './roles.ts';
import { MINUTE_MS, SECOND_MS, type FixtureClock } from './time.ts';
import { costOf, FRESH_CONTEXT_TOKENS, RESUMED_CONTEXT_TOKENS, turnsToExceed, usageAfterTurns } from './token-model.ts';

export interface RunWorld {
  readonly runs: readonly RunView[];
  readonly byId: ReadonlyMap<string, RunView>;
  readonly logs: ReadonlyMap<string, readonly RunLogLine[]>;
}

/** How long before the snapshot the last line of a run that is going was written. */
const LAST_LINE_AGE_MS = 8 * SECOND_MS;
const MINIMUM_TURNS = 3;
const BUDGET_MARGIN = 0.9;
const TURNS_PER_MINUTE: Readonly<Record<AgentRole, number>> = {
  challenger: 1.4,
  'acceptance-author': 1,
  implementer: 1.2,
  reviewer: 1.3,
  auditor: 1.6,
  'release-auditor': 1.4,
  summarizer: 1,
};

function scriptFor(name: LoggedRunScript, runId: string, clock: FixtureClock): readonly ScriptStep[] {
  switch (name) {
    case 'status-filter-implementer':
      return statusFilterImplementer(runId, clock);
    case 'promo-savings-decision':
      return promoSavingsDecision(runId);
    case 'expired-promo-implementer':
      return expiredPromoImplementer(runId, clock);
    case 'search-second-review':
      return searchSecondReview(runId);
  }
}

function turnsFor(rule: TurnsRule, spec: RunSpec, model: string, maxTurns: number, maxBudgetUsd: number, contextTokens: number): number {
  switch (rule) {
    case 'turn-limit':
      return maxTurns;
    case 'budget-limit':
      return turnsToExceed(model, maxBudgetUsd, contextTokens);
    case 'by-duration': {
      const turns = Math.min(maxTurns, Math.max(MINIMUM_TURNS, Math.round((spec.durationMinutes ?? 0) * TURNS_PER_MINUTE[spec.role])));
      return withinBudget(model, maxBudgetUsd, contextTokens, turns);
    }
  }
}

/** A run that was not stopped for its spending stays comfortably under its budget. */
function withinBudget(model: string, budgetUsd: number, contextTokens: number, turns: number): number {
  let fitted = turns;
  while (fitted > MINIMUM_TURNS && costOf(model, usageAfterTurns(fitted, contextTokens)) > budgetUsd * BUDGET_MARGIN) fitted -= 1;
  return fitted;
}

function plainNumbers(spec: RunSpec, model: string, maxTurns: number, maxBudgetUsd: number): FoldedLog {
  const contextTokens = spec.resumed === true ? RESUMED_CONTEXT_TOKENS : FRESH_CONTEXT_TOKENS;
  const turns = turnsFor(spec.turns ?? 'by-duration', spec, model, maxTurns, maxBudgetUsd, contextTokens);
  const usage = usageAfterTurns(turns, contextTokens);
  return { lastLine: null, currentTool: null, subagents: [], usage, costUsd: costOf(model, usage), turns, logLength: 0 };
}

function viewOf(spec: RunSpec, clock: FixtureClock): { readonly run: RunView; readonly log: readonly RunLogLine[] | null } {
  const setting = roleSetting(spec.role);
  const model = spec.model ?? setting.model;
  const maxBudgetUsd = Math.min(setting.maxBudgetUsd, PER_RUN_CAP_USD);
  const startMs = clock.now - spec.startedMinutesAgo * MINUTE_MS;
  const endMs = spec.durationMinutes === null ? null : startMs + spec.durationMinutes * MINUTE_MS;
  const log =
    spec.script === undefined ? null : stampSteps(spec.id, scriptFor(spec.script, spec.id, clock), startMs, endMs ?? clock.now - LAST_LINE_AGE_MS);
  const numbers = log === null ? plainNumbers(spec, model, setting.maxTurns, maxBudgetUsd) : foldLog(log);
  const live = endMs === null;
  const run: RunView = {
    id: spec.id,
    project: spec.project,
    role: spec.role,
    model,
    effort: spec.effort ?? setting.effort,
    account: spec.account,
    status: spec.status,
    outcome: spec.outcome,
    subject: spec.subject,
    attempt: spec.attempt,
    currentTool: live ? numbers.currentTool : null,
    branch: spec.branch,
    startedAt: new Date(startMs).toISOString(),
    endedAt: endMs === null ? null : new Date(endMs).toISOString(),
    usage: numbers.usage,
    costUsd: numbers.costUsd,
    turns: numbers.turns,
    maxTurns: setting.maxTurns,
    maxBudgetUsd,
    lastLine: numbers.lastLine,
    logLength: numbers.logLength,
    subagents: live ? numbers.subagents : numbers.subagents.map((subagent) => ({ ...subagent, status: subagent.status === 'running' ? 'done' : subagent.status })),
    pendingQuestion:
      spec.question === undefined || endMs === null
        ? null
        : { id: spec.question.id, text: spec.question.text, options: [...spec.question.options], askedAt: new Date(endMs).toISOString() },
  };
  return { run, log };
}

/** Every run of the installation, newest first, with the logs of the few that have one. */
export function buildRuns(clock: FixtureClock): RunWorld {
  const specs = [...STOREFRONT_RUN_SPECS, ...LEDGER_RUN_SPECS].sort((left, right) => left.startedMinutesAgo - right.startedMinutesAgo || left.id.localeCompare(right.id));
  const runs: RunView[] = [];
  const logs = new Map<string, readonly RunLogLine[]>();
  for (const spec of specs) {
    const { run, log } = viewOf(spec, clock);
    runs.push(run);
    if (log !== null) logs.set(run.id, log);
  }
  return { runs, byId: new Map(runs.map((run) => [run.id, run])), logs };
}

export function runOf(world: RunWorld, id: string): RunView {
  const run = world.byId.get(id);
  if (run === undefined) throw new Error(`the world has no run ${id}`);
  return run;
}
