import type { CockpitSnapshot, RunView, StreamEvent } from '../contract/index.ts';
import { CockpitSnapshotSchema } from '../contract/index.ts';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** A snapshot holding the installation and nothing else, to exercise the data layer without a world. */
export function emptySnapshot(now: number, sequence = 10): CockpitSnapshot {
  const at = new Date(now).toISOString();
  return CockpitSnapshotSchema.parse({
    sequence,
    generatedAt: at,
    installation: {
      version: '0.1.0',
      mode: 'live',
      operator: 'Alex Morgan',
      publicUrl: 'https://factory.example.com',
      startedAt: at,
      pauses: [],
      runSlots: { limit: 3, running: 0, queued: 0 },
      staleAfterMs: { forge: 15 * MINUTE_MS, health: 10 * MINUTE_MS, resources: 2 * MINUTE_MS, tools: 12 * HOUR_MS, knowledge: 15 * MINUTE_MS },
    },
    projects: [],
    runs: [],
    usage: { accounts: [], refreshMinutes: 15, staleAfterMinutes: 45 },
    costs: {
      basis: 'subscription-equivalent',
      today: { date: at.slice(0, 10), costUsd: 0, runs: 0 },
      monthToDateUsd: 0,
      dailyCap: { kind: 'none' },
      perRunCapUsd: null,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, withoutCache: 0, withCache: 0 },
      daily: [],
      byProject: [],
      byRole: [],
      byModel: [],
      byIssue: [],
    },
    resources: {
      sample: { value: { freeMemoryPercent: 63, pressure: 'normal' }, readAt: at, error: null },
      minimumFreeMemoryPercent: 40,
      pauseAbovePressure: 'normal',
      schedulingPaused: false,
    },
    tools: [],
    settings: {
      models: ['claude-sonnet-5-5'],
      defaultRoles: [],
      resources: { minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal', maxConcurrentRuns: 3 },
      notifications: [],
      remoteAccess: 'none',
      configuration: { path: '/srv/example-org/factory/config.yaml', restartRequired: [], reloadFailure: null },
    },
    activity: [],
  });
}

export function eventAt(now: number, sequence: number, overrides: Partial<StreamEvent> = {}): StreamEvent {
  return {
    sequence,
    occurredAt: new Date(now).toISOString(),
    type: 'issue.transitioned',
    project: 'storefront',
    subject: 'issue/12',
    summary: `Issue #12 moved on (event ${sequence})`,
    ...overrides,
  };
}

export function runAt(now: number, id: string, overrides: Partial<RunView> = {}): RunView {
  return {
    id,
    project: 'storefront',
    role: 'implementer',
    model: 'claude-sonnet-5-5',
    effort: 'medium',
    account: 'personal',
    status: 'running',
    outcome: null,
    subject: { kind: 'issue', id: '12' },
    attempt: 1,
    currentTool: null,
    branch: 'factory/issue-12',
    startedAt: new Date(now - 5 * MINUTE_MS).toISOString(),
    endedAt: null,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    costUsd: 0,
    turns: 0,
    maxTurns: 80,
    maxBudgetUsd: 5,
    lastLine: null,
    logLength: 0,
    subagents: [],
    pendingQuestion: null,
    ...overrides,
  };
}
