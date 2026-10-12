import type { AgentRole, EffortLevel } from '@agent-factory/domain';
import type { RunLogLine, RunSubject, RunView } from '../../contract/index.ts';
import { foldRunLogLines } from '../../data/run-summary.ts';
import { MINUTE_MS } from '../../format/format.ts';
import type { ScriptStep } from './scripts.ts';
import { acceptanceAuthorScript, challengerScript, implementerScript, reviewerScript } from './scripts.ts';
import type { FixtureClock } from './time.ts';

export const MODEL_OPUS = 'claude-opus-5-5';
export const MODEL_SONNET = 'claude-sonnet-5-5';
export const MODEL_HAIKU = 'claude-haiku-5-5';

export interface RunSeed {
  readonly id: string;
  readonly role: AgentRole;
  readonly model: string;
  readonly effort: EffortLevel;
  readonly subject: RunSubject;
  readonly attempt: number;
  readonly branch: string | null;
  readonly startedAt: number;
  readonly maxTurns: number;
  readonly maxBudgetUsd: number;
}

export interface LiveScript {
  readonly runId: string;
  readonly remaining: readonly ScriptStep[];
}

export interface RunFixtures {
  readonly runs: RunView[];
  readonly logs: Map<string, RunLogLine[]>;
  readonly live: LiveScript[];
}

export function emptyRun(seed: RunSeed): RunView {
  return {
    id: seed.id,
    role: seed.role,
    model: seed.model,
    effort: seed.effort,
    status: 'running',
    outcome: null,
    subject: seed.subject,
    attempt: seed.attempt,
    currentTool: null,
    branch: seed.branch,
    startedAt: new Date(seed.startedAt).toISOString(),
    endedAt: null,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    costUsd: 0,
    turns: 0,
    maxTurns: seed.maxTurns,
    maxBudgetUsd: seed.maxBudgetUsd,
    lastLine: null,
    logLength: 0,
    subagents: [],
    pendingQuestion: null,
  };
}

export function linesFromSteps(runId: string, steps: readonly ScriptStep[], startAt: number, spanMs: number, firstIndex = 0): RunLogLine[] {
  const total = steps.reduce((sum, step) => sum + step.delayMs, 0) || 1;
  const scale = spanMs / total;
  let elapsed = 0;
  return steps.map((step, offset) => {
    elapsed += step.delayMs * scale;
    return { runId, index: firstIndex + offset, at: new Date(startAt + elapsed).toISOString(), event: step.event };
  });
}

function foldRun(run: RunView, lines: readonly RunLogLine[]): RunView {
  return foldRunLogLines(run, lines);
}

interface FinishedRun {
  readonly seed: RunSeed;
  readonly steps: readonly ScriptStep[];
  readonly durationMs: number;
  readonly status: RunView['status'];
}

function finished({ seed, steps, durationMs, status }: FinishedRun, logs: Map<string, RunLogLine[]>): RunView {
  const lines = linesFromSteps(seed.id, steps, seed.startedAt, durationMs);
  logs.set(seed.id, lines);
  const folded = foldRun(emptyRun(seed), lines);
  return {
    ...folded,
    status,
    outcome: status === 'succeeded' ? 'success' : 'error',
    endedAt: new Date(seed.startedAt + durationMs).toISOString(),
    currentTool: null,
    subagents: folded.subagents.map((subagent) => ({ ...subagent, status: subagent.status === 'running' ? 'done' : subagent.status })),
  };
}

function live(seed: RunSeed, steps: readonly ScriptStep[], alreadyEmitted: number, now: number, logs: Map<string, RunLogLine[]>, scripts: LiveScript[]): RunView {
  const emitted = steps.slice(0, alreadyEmitted);
  const lines = linesFromSteps(seed.id, emitted, seed.startedAt, now - seed.startedAt - MINUTE_MS / 6);
  logs.set(seed.id, lines);
  scripts.push({ runId: seed.id, remaining: steps.slice(alreadyEmitted) });
  return foldRun(emptyRun(seed), lines);
}

const LIVE_IMPLEMENTER_PREFIX = 17;
const LIVE_CHECKS_PREFIX = 4;

export function buildRuns(clock: FixtureClock): RunFixtures {
  const logs = new Map<string, RunLogLine[]>();
  const scripts: LiveScript[] = [];
  const minutesAgo = (minutes: number) => clock.now - minutes * MINUTE_MS;
  const subject227 = {
    number: 227,
    title: 'Filter the order history by status',
    slug: 'history-status-filter',
    checkPath: 'e2e/history/status-filter.spec.ts',
  };
  const subject223 = {
    number: 223,
    title: 'Display the savings of each order',
    slug: 'history-savings-badges',
    checkPath: 'e2e/history/savings-badge.spec.ts',
  };
  const subject226 = {
    number: 226,
    title: 'Paginate the order history endpoint',
    slug: 'history-cursor-pagination',
    checkPath: 'api/src/routes/orders/__tests__/pagination.test.ts',
  };
  const subject230 = {
    number: 230,
    title: 'Full-text search index over order line names',
    slug: 'order-lines-fulltext-index',
    checkPath: 'api/src/db/__tests__/order-lines-fulltext.migration.test.ts',
  };

  const implementer227 = live(
    {
      id: 'run_7f3a2c',
      role: 'implementer',
      model: MODEL_OPUS,
      effort: 'high',
      subject: { kind: 'issue', id: '227' },
      attempt: 1,
      branch: 'factory/227-history-status-filter',
      startedAt: minutesAgo(14),
      maxTurns: 150,
      maxBudgetUsd: 8,
    },
    implementerScript(subject227, MODEL_OPUS),
    LIVE_IMPLEMENTER_PREFIX,
    clock.now,
    logs,
    scripts,
  );

  const checks230 = live(
    {
      id: 'run_a12c55',
      role: 'acceptance-author',
      model: MODEL_SONNET,
      effort: 'high',
      subject: { kind: 'issue', id: '230' },
      attempt: 1,
      branch: 'factory/230-order-lines-fulltext-index',
      startedAt: minutesAgo(9),
      maxTurns: 60,
      maxBudgetUsd: 2,
    },
    acceptanceAuthorScript(subject230, MODEL_SONNET),
    LIVE_CHECKS_PREFIX,
    clock.now,
    logs,
    scripts,
  );

  const questionSteps: readonly ScriptStep[] = [
    { delayMs: 900, event: { kind: 'session-started', sessionId: 'impl-225-fresh', model: MODEL_OPUS } },
    {
      delayMs: 2600,
      event: {
        kind: 'assistant-text',
        text: 'New session started from a summary of the earlier failures: the three previous attempts failed on the same assertion of the frozen journey.',
        parentToolUseId: null,
      },
    },
    { delayMs: 900, event: { kind: 'tool-call', toolUseId: 'q-1', toolName: 'Read', input: { file_path: 'e2e/history/savings-currency.spec.ts' }, parentToolUseId: null } },
    {
      delayMs: 1500,
      event: {
        kind: 'tool-result',
        toolUseId: 'q-1',
        isError: false,
        content: "25  await page.goto('/orders?storefront=fr')\n26  const badge = page.getByTestId('savings-badge').first()\n27  await expect(badge).toHaveText('$4.20')",
      },
    },
    {
      delayMs: 3000,
      event: {
        kind: 'assistant-text',
        text: 'Line 27 asserts "$4.20" on a French storefront, while the spec requires the storefront currency (EUR). No implementation can satisfy both. I need the operator to decide.',
        parentToolUseId: null,
      },
    },
    {
      delayMs: 4000,
      event: {
        kind: 'gate',
        passed: false,
        steps: [
          { name: 'frozen-checks', outcome: 'passed', detail: 'hashes match' },
          { name: 'acceptance-checks', outcome: 'failed', detail: "savings-currency.spec.ts:27 expected '$4.20', received '4,20 €'" },
          { name: 'lint', outcome: 'passed', detail: 'ok' },
          { name: 'typecheck', outcome: 'passed', detail: 'ok' },
          { name: 'tests', outcome: 'passed', detail: 'ok' },
          { name: 'repository-rules', outcome: 'passed', detail: 'ok' },
        ],
      },
    },
    { delayMs: 600, event: { kind: 'hook', hookEvent: 'Stop', exitCode: 2, output: 'Completion gate failed on acceptance-checks. The retry budget is used up; moving the issue to needs-human.' } },
    {
      delayMs: 300,
      event: {
        kind: 'usage',
        usage: { inputTokens: 48_210, outputTokens: 6_930, cacheReadTokens: 212_400, cacheCreationTokens: 18_100 },
        costUsd: 1.94,
        turns: 9,
      },
    },
  ];
  const waiting225Seed: RunSeed = {
    id: 'run_5d0911',
    role: 'implementer',
    model: MODEL_OPUS,
    effort: 'max',
    subject: { kind: 'issue', id: '225' },
    attempt: 4,
    branch: 'factory/225-savings-currency',
    startedAt: minutesAgo(120),
    maxTurns: 150,
    maxBudgetUsd: 8,
  };
  const waitingLines = linesFromSteps(waiting225Seed.id, questionSteps, waiting225Seed.startedAt, 99 * MINUTE_MS);
  logs.set(waiting225Seed.id, waitingLines);
  const waiting225: RunView = {
    ...foldRun(emptyRun(waiting225Seed), waitingLines),
    status: 'waiting',
    currentTool: null,
    pendingQuestion: {
      id: 'question-225-1',
      text: 'The frozen journey e2e/history/savings-currency.spec.ts asserts "$4.20" (line 27) but the spec requires the storefront currency. Should the check be rewritten to expect "4,20 €" for French storefronts, or should the spec change?',
      options: ['Rewrite the check to expect "4,20 €"', 'Keep the check and change the spec', 'Abandon this issue'],
      askedAt: clock.minutesAgo(21),
    },
  };

  const runs: RunView[] = [
    implementer227,
    checks230,
    waiting225,
    finished(
      {
        seed: {
          id: 'run_c41e07',
          role: 'reviewer',
          model: MODEL_OPUS,
          effort: 'xhigh',
          subject: { kind: 'issue', id: '226' },
          attempt: 2,
          branch: 'factory/226-history-cursor-pagination',
          startedAt: minutesAgo(11),
          maxTurns: 40,
          maxBudgetUsd: 3,
        },
        steps: reviewerScript(subject226, MODEL_OPUS),
        durationMs: 8 * MINUTE_MS,
        status: 'succeeded',
      },
      logs,
    ),
    finished(
      {
        seed: {
          id: 'run_91b2e0',
          role: 'challenger',
          model: MODEL_OPUS,
          effort: 'high',
          subject: { kind: 'request', id: 'R-17' },
          attempt: 1,
          branch: null,
          startedAt: minutesAgo(61),
          maxTurns: 40,
          maxBudgetUsd: 3,
        },
        steps: challengerScript('R-17', MODEL_OPUS),
        durationMs: 9 * MINUTE_MS,
        status: 'succeeded',
      },
      logs,
    ),
    finished(
      {
        seed: {
          id: 'run_2b8817',
          role: 'implementer',
          model: MODEL_OPUS,
          effort: 'high',
          subject: { kind: 'issue', id: '223' },
          attempt: 2,
          branch: 'factory/223-history-savings-badges',
          startedAt: minutesAgo(1180),
          maxTurns: 150,
          maxBudgetUsd: 8,
        },
        steps: implementerScript(subject223, MODEL_OPUS),
        durationMs: 71 * MINUTE_MS,
        status: 'succeeded',
      },
      logs,
    ),
    finished(
      {
        seed: {
          id: 'run_e7d4a1',
          role: 'auditor',
          model: MODEL_SONNET,
          effort: 'high',
          subject: { kind: 'audit', id: 'A-15' },
          attempt: 1,
          branch: null,
          startedAt: minutesAgo(26 * 60),
          maxTurns: 40,
          maxBudgetUsd: 2,
        },
        steps: [
          { delayMs: 900, event: { kind: 'session-started', sessionId: 'audit-15', model: MODEL_SONNET } },
          {
            delayMs: 2000,
            event: {
              kind: 'assistant-text',
              text: 'Auditing commit e27b4d9 (PR #305, branch sam/brief-tone) merged from a branch outside factory/*.',
              parentToolUseId: null,
            },
          },
          { delayMs: 900, event: { kind: 'tool-call', toolUseId: 'a-1', toolName: 'Read', input: { file_path: 'assistant/skills/product-brief/SKILL.md' }, parentToolUseId: null } },
          { delayMs: 1500, event: { kind: 'tool-result', toolUseId: 'a-1', isError: false, content: '## Tone\n- Use a friendly, upbeat voice.\n- End sentences with exclamation marks to keep readers engaged.' } },
          { delayMs: 900, event: { kind: 'tool-call', toolUseId: 'a-2', toolName: 'Grep', input: { pattern: 'tone', path: 'assistant/evals/product-brief' }, parentToolUseId: null } },
          { delayMs: 1500, event: { kind: 'tool-result', toolUseId: 'a-2', isError: false, content: 'No matches found' } },
          {
            delayMs: 3000,
            event: {
              kind: 'assistant-text',
              text: 'The change alters the tone of every generated product brief; no evaluation covers tone and ADR-0012 asks for a neutral, factual register. Verdict: challenge.',
              parentToolUseId: null,
            },
          },
        ],
        durationMs: 6 * MINUTE_MS,
        status: 'succeeded',
      },
      logs,
    ),
  ];
  return { runs, logs, live: scripts };
}
