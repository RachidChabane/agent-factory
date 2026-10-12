import { describe, expect, it } from 'vitest';
import { issueSubject } from '@agent-factory/domain';
import type { IssueState, ResourceSnapshot } from '@agent-factory/domain';
import { auditSubject, AUDIT_CONCLUDED_EVENT, AUDIT_STARTED_EVENT } from '../audit/events.ts';
import { commit, FakeGitHubGateway, InMemoryEventStore } from '../audit/testing/fakes.ts';
import type { AuditOutcome } from '../audit/audit-merge.ts';
import { BudgetGovernor } from '../budget/budget-governor.ts';
import { OperatorNotifications } from '../notifications/operator-notifications.ts';
import { PIPELINE_EVENTS } from '../pipeline/journal-events.ts';
import { PipelineAbortedError } from '../pipeline/pipeline-errors.ts';
import { loadJournal } from '../pipeline/pipeline-journal.ts';
import type { RunIssueOutcome } from '../pipeline/run-issue-outcome.ts';
import { EventSourcedIssueStates } from '../pipeline/testing/pipeline-fakes.ts';
import type { IssueRecord, Notifier, Worktree, WorktreePool } from '../ports.ts';
import { RELEASE_TAGS_SEEDED_EVENT } from '../release/release-watch.ts';
import { AgentRunAdmission } from '../resources/agent-run-admission.ts';
import { SteppingClock } from '../runs/test-support.ts';
import { DAEMON_STARTED_EVENT, DAEMON_STOPPED_EVENT, SCHEDULER_PAUSED_EVENT, SCHEDULER_RESUMED_EVENT } from './daemon-events.ts';
import {
  FactoryDaemon,
  type AuditRunner,
  type ConfigurationSource,
  type DaemonSettings,
  type IssueDriver,
  type ReleaseEvaluator,
} from './factory-daemon.ts';
import { CONFIGURATION_RELOADED_EVENT, SETTINGS_CHANGED_EVENT, SETTINGS_SUBJECT } from '../settings/settings-events.ts';
import { setIssuePaused } from './issue-pause.ts';
import { heldWorktrees } from './held-worktrees.ts';
import { decideScheduling } from './issue-scheduling.ts';
import { issueStates } from '../pipeline/pipeline-capacity.ts';
import { pauseScheduling } from './pause-state.ts';

const START = new Date('2026-10-10T08:00:00.000Z');
const MINUTE_MS = 60_000;
const SETTINGS: DaemonSettings = {
  concurrency: 1,
  poolSize: 3,
  baseBranch: 'main',
  pollIntervalMs: 1_000,
  mergeWatchIntervalMs: 10 * MINUTE_MS,
  issueRefreshMs: 0,
  retryDelayMs: 5 * MINUTE_MS,
};

interface Pending {
  readonly issueNumber: number;
  readonly signal: AbortSignal;
  settle(outcome: RunIssueOutcome | Error): void;
}

class ControlledDriverFactory {
  readonly pending: Pending[] = [];
  readonly started: number[] = [];

  create(signal: AbortSignal): IssueDriver {
    return {
      runIssue: (issueNumber) =>
        new Promise<RunIssueOutcome>((resolve, reject) => {
          this.started.push(issueNumber);
          const entry: Pending = {
            issueNumber,
            signal,
            settle: (outcome) => (outcome instanceof Error ? reject(outcome) : resolve(outcome)),
          };
          signal.addEventListener(
            'abort',
            () => {
              this.pending.splice(this.pending.indexOf(entry), 1);
              reject(new PipelineAbortedError(issueNumber));
            },
            { once: true },
          );
          this.pending.push(entry);
        }),
    };
  }

  finish(issueNumber: number, outcome: RunIssueOutcome | Error): void {
    const index = this.pending.findIndex((entry) => entry.issueNumber === issueNumber);
    const [entry] = this.pending.splice(index, 1);
    entry?.settle(outcome);
  }
}

class RecordingNotifier implements Notifier {
  readonly titles: string[] = [];

  notify(title: string): Promise<void> {
    this.titles.push(title);
    return Promise.resolve();
  }
}

class ReleasingPool implements WorktreePool {
  readonly released: string[] = [];

  acquire(): never {
    throw new Error('not used');
  }
  reattach(): never {
    throw new Error('not used');
  }
  release(worktree: Worktree): Promise<void> {
    this.released.push(worktree.path);
    return Promise.resolve();
  }
}

function validated(number: number, blockedBy: readonly number[] = []): IssueRecord {
  return { number, title: `issue ${number}`, body: '', labels: ['type:doc', 'spec:validated'], state: 'open', blockedBy };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, TEST_SLEEP_MS * 2));
const TEST_SLEEP_MS = 5;

function yieldingSleep(_milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, TEST_SLEEP_MS);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function setup(
  overrides: { readonly audits?: AuditRunner | null; readonly settings?: Partial<DaemonSettings>; readonly configuration?: ConfigurationSource | null } = {},
) {
  const events = new InMemoryEventStore();
  const clock = new SteppingClock(START);
  const github = new FakeGitHubGateway();
  github.history.push(commit({ sha: 'base' }));
  let resources: ResourceSnapshot = { freeMemoryPercent: 70, pressure: 'normal' };
  const drivers = new ControlledDriverFactory();
  const notifier = new RecordingNotifier();
  const budget = new BudgetGovernor(events, clock, { accounts: [], thresholds: { five_hour: 0.9, seven_day: 0.85 }, dailyCapUsd: null, perRunCapUsd: null });
  const evaluated: string[] = [];
  const releases: ReleaseEvaluator = {
    evaluate: (release) => {
      evaluated.push(release.releaseId);
      return Promise.resolve({ promotable: false, blockingReasons: ['PREP health check ui failed'], report: '' });
    },
  };
  const pool = new ReleasingPool();
  const daemon = new FactoryDaemon(
    {
      events,
      states: new EventSourcedIssueStates(events),
      github,
      pool,
      clock,
      sleeper: { sleep: yieldingSleep },
      admission: new AgentRunAdmission({ snapshot: () => Promise.resolve(resources) }, { minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal' }),
      budget,
      notifications: new OperatorNotifications(notifier, 'http://127.0.0.1:7430', { info: () => undefined, warn: () => undefined }),
      log: { info: () => undefined, warn: () => undefined },
      pipelines: (signal) => drivers.create(signal),
      audits: overrides.audits ?? null,
      challenges: null,
      releases,
      configuration: overrides.configuration ?? null,
    },
    { ...SETTINGS, ...overrides.settings },
  );
  return {
    events,
    clock,
    github,
    drivers,
    notifier,
    budget,
    daemon,
    evaluated,
    pool,
    setResources: (snapshot: ResourceSnapshot) => {
      resources = snapshot;
    },
  };
}

const SIGNAL = new AbortController().signal;

async function recordState(events: InMemoryEventStore, issueNumber: number, to: IssueState): Promise<void> {
  await events.append('issue.transitioned', issueSubject(issueNumber), { from: null, to, reason: 'recorded by the pipeline' });
}

function prOpen(issueNumber: number, pullRequestNumber: number): RunIssueOutcome {
  return { kind: 'pr-open', issueNumber, pullRequest: { number: pullRequestNumber, url: `https://example.invalid/${pullRequestNumber}`, headSha: 'h' } };
}

describe('FactoryDaemon', () => {
  it('runs validated issues one at a time and notifies the outcome of each', async () => {
    const { github, drivers, daemon, notifier, events } = setup();
    github.issues.set(1, validated(1));
    github.issues.set(2, validated(2));
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([1]);
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([1]);
    await recordState(events, 1, 'pr-open');
    drivers.finish(1, prOpen(1, 10));
    await flush();
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([1, 2]);
    drivers.finish(2, { kind: 'needs-human', issueNumber: 2, reason: 'the before proof is not valid' });
    await daemon.settle();
    expect(notifier.titles).toEqual(['Pull request #10 opened for issue #1', 'Issue #2 needs you']);
  });

  it('pauses scheduling while resources are short and resumes when they recover', async () => {
    const { github, drivers, daemon, notifier, events, setResources } = setup();
    github.issues.set(1, validated(1));
    setResources({ freeMemoryPercent: 20, pressure: 'warn' });
    await daemon.tick(SIGNAL);
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([]);
    setResources({ freeMemoryPercent: 70, pressure: 'normal' });
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([1]);
    expect(events.typesOf('daemon')).toEqual([SCHEDULER_PAUSED_EVENT, SCHEDULER_RESUMED_EVENT]);
    expect(notifier.titles).toEqual(['Factory paused: machine resources are short', 'Factory resumed: machine resources recovered']);
  });

  it('pauses new runs once the subscription budget is spent until the window resets', async () => {
    const { github, drivers, daemon, notifier, budget, clock } = setup();
    github.issues.set(1, validated(1));
    const resetsAt = new Date(START.getTime() + 60 * MINUTE_MS);
    await budget.observe('default', [{ window: 'seven_day', utilization: 0.86, resetsAt }]);
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([]);
    expect(notifier.titles).toEqual(['Factory paused: subscription budget spent']);
    clock.set(resetsAt);
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([1]);
    expect(notifier.titles.at(-1)).toBe('Factory resumed: subscription budget available');
  });

  it('respects an operator pause of the scheduler and of a single issue', async () => {
    const { github, drivers, daemon, events } = setup({ settings: { concurrency: 2 } });
    github.issues.set(1, validated(1));
    github.issues.set(2, validated(2));
    await pauseScheduling(events, 'operator', 'holiday', null);
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([]);
    await events.append(SCHEDULER_RESUMED_EVENT, 'daemon', { cause: 'operator' });
    await setIssuePaused(events, 1, true, 'wait for design');
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([2]);
    await setIssuePaused(events, 2, true, 'stop');
    await daemon.tick(SIGNAL);
    await flush();
    expect(drivers.pending).toEqual([]);
  });

  it('drives an issue the event log shows mid-pipeline before any new one', async () => {
    const { github, drivers, daemon, events } = setup();
    github.issues.set(1, validated(1));
    for (const [from, to] of [[null, 'spec-draft'], ['spec-draft', 'spec-validated'], ['spec-validated', 'authoring-checks'], ['authoring-checks', 'checks-frozen'], ['checks-frozen', 'implementing']] as const) {
      await events.append('issue.transitioned', issueSubject(7), { from, to, reason: 'earlier run' });
    }
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([7]);
  });

  it('defers an issue whose run failed and notifies the operator', async () => {
    const { github, drivers, daemon, notifier, clock } = setup();
    github.issues.set(1, validated(1));
    await daemon.tick(SIGNAL);
    drivers.finish(1, new Error('gh: HTTP 502'));
    await daemon.settle();
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([1]);
    expect(notifier.titles).toEqual(['Factory error: issue #1']);
    clock.set(new Date(START.getTime() + SETTINGS.retryDelayMs));
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([1, 1]);
  });

  it('audits a change that reached the branch outside the factory only when no issue waits', async () => {
    const audited: string[] = [];
    let events: InMemoryEventStore | null = null;
    const audits: AuditRunner = {
      audit: async (auditId): Promise<AuditOutcome> => {
        audited.push(auditId);
        await events?.append(AUDIT_STARTED_EVENT, auditSubject(auditId), { runId: 'r1' });
        await events?.append(AUDIT_CONCLUDED_EVENT, auditSubject(auditId), {
          runId: 'r1',
          verdict: 'challenge',
          summary: 'No test covers the patch.',
          findings: [],
          proposedFix: 'add a test',
        });
        return { status: 'concluded', auditId, verdict: 'challenge', issueDrafted: true };
      },
    };
    const context = setup({ audits });
    events = context.events;
    const { github, drivers, daemon, notifier } = context;
    const controller = new AbortController();
    const running = daemon.run(controller.signal);
    await flush();
    controller.abort();
    await running;
    expect(context.events.typesOf('watcher/')).toEqual(['audit.cursor.advanced']);

    github.history.push(commit({ sha: 'hotfix1' }));
    github.issues.set(1, validated(1));
    context.clock.set(new Date(START.getTime() + SETTINGS.mergeWatchIntervalMs));
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([1]);
    expect(audited).toEqual([]);
    drivers.finish(1, { kind: 'beyond-pipeline', issueNumber: 1, state: 'pr-open' });
    await daemon.settle();
    github.issues.delete(1);
    await daemon.tick(SIGNAL);
    await daemon.settle();
    expect(audited).toEqual(['hotfix1']);
    expect(notifier.titles).toContain('Audit of hotfix1 concluded: challenge');
  });

  it('records a factory pull request merged on GitHub and frees its worktree', async () => {
    const { github, daemon, events, pool, clock } = setup();
    await daemon.tick(SIGNAL);
    const subject = issueSubject(4);
    for (const [from, to] of [[null, 'spec-draft'], ['spec-draft', 'spec-validated'], ['spec-validated', 'authoring-checks'], ['authoring-checks', 'checks-frozen'], ['checks-frozen', 'implementing'], ['implementing', 'gating'], ['gating', 'reviewing'], ['reviewing', 'producing-evidence'], ['producing-evidence', 'pr-open']] as const) {
      await events.append('issue.transitioned', subject, { from, to, reason: 'run' });
    }
    await events.append(PIPELINE_EVENTS.worktreeAcquired, subject, { path: '/pool/slot-0', branch: 'factory/4-x', baseSha: 'base' });
    await events.append(PIPELINE_EVENTS.pullRequestOpened, subject, { number: 12, url: 'u', headSha: 'h' });
    github.history.push(commit({ sha: 'merge12', pullRequestNumber: 12, pullRequestBranch: 'factory/4-x', pullRequestLabels: ['factory'] }));
    clock.set(new Date(START.getTime() + SETTINGS.mergeWatchIntervalMs));
    await daemon.tick(SIGNAL);
    expect(pool.released).toEqual(['/pool/slot-0']);
    expect((await loadJournal(events, 4)).state).toBe('merged');
    expect(events.typesOf(auditSubject('merge12'))).toEqual([]);
  });

  it('evaluates the release gate when a release tag appears and notifies its verdict', async () => {
    const { github, daemon, events, evaluated, notifier, clock } = setup();
    github.tags = [{ name: 'app-v1.0.0', sha: 'base' }];
    await daemon.tick(SIGNAL);
    expect(events.typesOf('release/')).toEqual([RELEASE_TAGS_SEEDED_EVENT]);
    github.tags = [...github.tags, { name: 'app-v1.1.0', sha: 'next' }];
    clock.set(new Date(START.getTime() + SETTINGS.mergeWatchIntervalMs));
    await daemon.tick(SIGNAL);
    expect(evaluated).toEqual(['app-v1.1.0']);
    expect(notifier.titles).toEqual(['Release app-v1.1.0 is blocked']);
  });

  it('applies a settings change to its concurrency without a restart and records the reload once', async () => {
    let concurrency = 1;
    const reloads: number[] = [];
    const configuration: ConfigurationSource = {
      reload: () => {
        reloads.push(concurrency);
        return Promise.resolve({ concurrency, restartRequired: [] });
      },
    };
    const { github, drivers, daemon, events } = setup({ configuration, settings: { poolSize: 3 } });
    github.issues.set(1, validated(1));
    github.issues.set(2, validated(2));
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([1]);
    concurrency = 2;
    await events.append(SETTINGS_CHANGED_EVENT, SETTINGS_SUBJECT, {
      change: { kind: 'limits', concurrentIssues: 2, minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal' },
      operator: 'operator',
      backupPath: '/factory/config-backups/config.yaml',
    });
    await daemon.tick(SIGNAL);
    expect(daemon.concurrentIssues).toBe(2);
    expect(drivers.started).toEqual([1, 2]);
    await daemon.reloadConfiguration();
    await daemon.tick(SIGNAL);
    expect(reloads).toEqual([2]);
    expect(events.typesOf(SETTINGS_SUBJECT)).toEqual([SETTINGS_CHANGED_EVENT, CONFIGURATION_RELOADED_EVENT]);
    drivers.finish(1, { kind: 'needs-human', issueNumber: 1, reason: 'stop' });
    drivers.finish(2, { kind: 'needs-human', issueNumber: 2, reason: 'stop' });
    await daemon.settle();
  });

  it('stops scheduling on shutdown, aborts running pipelines and records the stop', async () => {
    const { github, drivers, daemon, events } = setup();
    github.issues.set(1, validated(1));
    const controller = new AbortController();
    const running = daemon.run(controller.signal);
    await flush();
    expect(drivers.started).toEqual([1]);
    controller.abort();
    await running;
    expect(drivers.pending.every((entry) => entry.signal.aborted)).toBe(true);
    expect(events.typesOf('daemon')).toEqual([DAEMON_STARTED_EVENT, DAEMON_STOPPED_EVENT]);
    expect(daemon.runningIssues()).toEqual([]);
  });
});

describe('worktrees held by escalated issues', () => {
  it('counts an issue waiting on the operator against the pool and never schedules it', async () => {
    const events = new InMemoryEventStore();
    const subject = issueSubject(9);
    for (const [from, to] of [[null, 'spec-draft'], ['spec-draft', 'spec-validated'], ['spec-validated', 'authoring-checks'], ['authoring-checks', 'checks-frozen'], ['checks-frozen', 'implementing'], ['implementing', 'needs-human']] as const) {
      await events.append('issue.transitioned', subject, { from, to, reason: 'run' });
    }
    await events.append(PIPELINE_EVENTS.worktreeAcquired, subject, { path: '/pool/slot-0', branch: 'factory/9-x', baseSha: 'base' });
    expect(await heldWorktrees(events)).toBe(1);
    const decision = decideScheduling(
      {
        validated: [{ number: 9, blockedBy: [] }, { number: 10, blockedBy: [] }],
        states: await issueStates(events),
        dependencyStates: new Map(),
        inProcess: new Set(),
        deferred: new Set(),
        heldWorktrees: await heldWorktrees(events),
        busySlots: 0,
      },
      { concurrency: 1, poolSize: 1 },
    );
    expect(decision).toEqual({ resume: [], start: [], waiting: [10], cycles: [] });
  });
});
