import { describe, expect, it } from 'vitest';
import { issueSubject } from '@agent-factory/domain';
import type { ResourceSnapshot } from '@agent-factory/domain';
import { auditSubject, AUDIT_CONCLUDED_EVENT, AUDIT_STARTED_EVENT } from '../audit/events.ts';
import { commit, FakeGitHubGateway, InMemoryEventStore } from '../audit/testing/fakes.ts';
import type { AuditOutcome } from '../audit/audit-merge.ts';
import { BudgetGovernor } from '../budget/budget-governor.ts';
import { OperatorNotifications } from '../notifications/operator-notifications.ts';
import { PIPELINE_EVENTS } from '../pipeline/journal-events.ts';
import { loadJournal } from '../pipeline/pipeline-journal.ts';
import { EventSourcedIssueStates } from '../pipeline/testing/pipeline-fakes.ts';
import { RELEASE_TAGS_SEEDED_EVENT } from '../release/release-watch.ts';
import { AgentRunAdmission } from '../resources/agent-run-admission.ts';
import { SteppingClock } from '../runs/test-support.ts';
import { DAEMON_STARTED_EVENT, DAEMON_STOPPED_EVENT, SCHEDULER_PAUSED_EVENT, SCHEDULER_RESUMED_EVENT } from './daemon-events.ts';
import {
  FactoryDaemon,
  type AuditRunner,
  type ConfigurationSource,
  type DaemonSettings,
  type ReleaseEvaluator,
} from './factory-daemon.ts';
import { CONFIGURATION_RELOADED_EVENT, SETTINGS_CHANGED_EVENT, SETTINGS_SUBJECT } from '../settings/settings-events.ts';
import { setIssuePaused } from './issue-pause.ts';
import { heldWorktrees } from './held-worktrees.ts';
import { activeWorktreeShortage } from './worktree-shortage.ts';
import { decideScheduling } from './issue-scheduling.ts';
import { issueStates } from '../pipeline/pipeline-capacity.ts';
import { pauseScheduling } from './pause-state.ts';
import { MachineSchedulingPauses } from './scheduling-pauses.ts';
import { DEFAULT_PROJECT_CONVENTIONS } from '../conventions/project-conventions.ts';
import { FilmRefusedError } from '../film/film-errors.ts';
import type { FilmRunner } from '../film/film-runner.ts';
import { ORPHAN_FILM_REASON } from '../film/orphan-films.ts';
import type { PullRequestReadyScanner } from '../ready/pull-request-ready-watch.ts';
import { SLOTS_HELD } from './scheduling-hold.ts';
import { ControlledDriverFactory, prOpen, RecordingNotifier, recordState, ReleasingPool, validated } from './testing/daemon-fakes.ts';

const START = new Date('2026-10-10T08:00:00.000Z');
const MINUTE_MS = 60_000;
const SETTINGS: DaemonSettings = {
  concurrency: 1,
  poolSize: 3,
  baseBranch: 'main',
  conventions: DEFAULT_PROJECT_CONVENTIONS,
  releaseModel: { kind: 'release-please', tagPattern: '*v*' },
  pollIntervalMs: 1_000,
  mergeWatchIntervalMs: 10 * MINUTE_MS,
  issueRefreshMs: 0,
  retryDelayMs: 5 * MINUTE_MS,
};

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
  overrides: {
    readonly audits?: AuditRunner | null;
    readonly films?: FilmRunner | null;
    readonly pullRequestReady?: PullRequestReadyScanner | null;
    readonly settings?: Partial<DaemonSettings>;
    readonly configuration?: ConfigurationSource | null;
  } = {},
) {
  const events = new InMemoryEventStore();
  const clock = new SteppingClock(START);
  const github = new FakeGitHubGateway();
  github.history.push(commit({ sha: 'base' }));
  let resources: ResourceSnapshot = { freeMemoryPercent: 70, pressure: 'normal' };
  const drivers = new ControlledDriverFactory();
  const notifier = new RecordingNotifier();
  const budget = new BudgetGovernor(events, clock, {
    accounts: [],
    thresholds: { session: 0.9, weekly_all: 0.85, weekly_scoped: 0.85 },
    dailyCap: { kind: 'none' },
    perRunCapUsd: null,
    staleAfterMs: 30 * MINUTE_MS,
  });
  const evaluated: string[] = [];
  const releases: ReleaseEvaluator = {
    evaluate: (release) => {
      evaluated.push(release.releaseId);
      return Promise.resolve({ promotable: false, blockingReasons: ['PREP health check ui failed'], report: '' });
    },
  };
  const pool = new ReleasingPool();
  const notifications = new OperatorNotifications(notifier, 'http://127.0.0.1:7430', { info: () => undefined, warn: () => undefined });
  const admission = new AgentRunAdmission({ snapshot: () => Promise.resolve(resources) }, { minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal' });
  const daemon = new FactoryDaemon(
    {
      events,
      states: new EventSourcedIssueStates(events),
      github,
      pool,
      clock,
      sleeper: { sleep: yieldingSleep },
      pauses: new MachineSchedulingPauses({ events, admission, budget, notifications }),
      notifications,
      log: { info: () => undefined, warn: () => undefined },
      pipelines: (signal) => drivers.create(signal),
      audits: overrides.audits ?? null,
      challenges: null,
      films: overrides.films ?? null,
      pullRequestReady: overrides.pullRequestReady ?? null,
      releases,
      configuration: overrides.configuration ?? null,
      reclaimStacks: () => Promise.resolve(0),
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
      change: { kind: 'concurrency', project: 'storefront', issues: 2, ceiling: 3 },
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

describe('FactoryDaemon and the films of the installation', () => {
  function filmRunner(): FilmRunner & { readonly refreshed: number[] } {
    const refreshed: number[] = [];
    return {
      refreshed,
      prepare: () => Promise.resolve(),
      film: () => Promise.reject(new Error('not used')),
      order: () => Promise.resolve(),
      orderDeclared: () => Promise.resolve([]),
      next: () => Promise.resolve(null),
      fail: () => Promise.resolve(),
      refreshBodies: () => {
        refreshed.push(refreshed.length);
        return Promise.resolve({ updated: [], failed: [] });
      },
    };
  }

  it('starts no issue while a film holds the slots, and starts it once they are free', async () => {
    const { github, drivers, daemon } = setup();
    github.issues.set(1, validated(1));
    await daemon.tick(SIGNAL, SLOTS_HELD);
    expect(drivers.started).toEqual([]);
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([1]);
  });

  it('starts no audit while a film holds the slots', async () => {
    const audited: string[] = [];
    const audits: AuditRunner = {
      audit: (auditId): Promise<AuditOutcome> => {
        audited.push(auditId);
        return Promise.resolve({ status: 'failed', auditId, reason: 'not used' });
      },
    };
    const context = setup({ audits });
    const controller = new AbortController();
    const running = context.daemon.run(controller.signal);
    await flush();
    controller.abort();
    await running;
    context.github.history.push(commit({ sha: 'hotfix1' }));
    context.clock.set(new Date(START.getTime() + SETTINGS.mergeWatchIntervalMs));

    await context.daemon.tick(SIGNAL, SLOTS_HELD);
    await context.daemon.settle();
    expect(audited).toEqual([]);

    await context.daemon.tick(SIGNAL);
    await context.daemon.settle();
    expect(audited).toEqual(['hotfix1']);
  });

  it('fails the films a stopped factory left recording and renders the placeholders again when it starts', async () => {
    const films = filmRunner();
    const { daemon, events } = setup({ films });
    const subject = issueSubject(5);
    await events.append(PIPELINE_EVENTS.filmQueued, subject, { scenario: 'checkout-flow', operator: 'Alex Morgan' });
    await events.append(PIPELINE_EVENTS.filmStarted, subject, { scenario: 'checkout-flow', operator: 'Alex Morgan', baseSha: 'base', headSha: 'head' });

    await daemon.start();

    const journal = await loadJournal(events, 5);
    expect(journal.filmOrders.map((order) => [order.status, order.reason])).toEqual([['failed', ORPHAN_FILM_REASON]]);
    expect(films.refreshed).toHaveLength(1);
  });

  it('still starts when the placeholders cannot be rendered', async () => {
    const films: FilmRunner = { ...filmRunner(), refreshBodies: () => Promise.reject(new Error('forge unreachable')) };
    const { daemon, events } = setup({ films });
    await daemon.start();
    expect(events.typesOf('daemon')).toEqual([DAEMON_STARTED_EVENT]);
  });

  it('refuses to order a film when the project films nothing', async () => {
    const { daemon } = setup();
    await expect(daemon.orderFilm({ issueNumber: 1, scenario: 'checkout-flow', operator: 'Alex Morgan' })).rejects.toBeInstanceOf(FilmRefusedError);
  });

  it('hands an order to the films of the project', async () => {
    const ordered: string[] = [];
    const films: FilmRunner = { ...filmRunner(), order: (order) => Promise.resolve(void ordered.push(order.scenario)) };
    const { daemon } = setup({ films });
    await daemon.orderFilm({ issueNumber: 1, scenario: 'checkout-flow', operator: 'Alex Morgan' });
    expect(ordered).toEqual(['checkout-flow']);
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
    expect(decision).toEqual({ resume: [], start: [], waiting: [10], awaitingWorktree: [10], cycles: [] });
  });
});

describe('worktrees held by open pull requests', () => {
  async function holdWithPullRequest(events: InMemoryEventStore, issueNumber: number, pullRequestNumber: number): Promise<void> {
    const subject = issueSubject(issueNumber);
    await recordState(events, issueNumber, 'pr-open');
    await events.append(PIPELINE_EVENTS.worktreeAcquired, subject, { path: `/pool/slot-${issueNumber}`, branch: `factory/${issueNumber}-x`, baseSha: 'base' });
    await events.append(PIPELINE_EVENTS.pullRequestOpened, subject, { number: pullRequestNumber, url: `https://example.invalid/pull/${pullRequestNumber}`, headSha: 'h' });
  }

  it('records that issues wait for a worktree, notifies it once, and clears it when a pull request is merged', async () => {
    const { github, drivers, daemon, notifier, events } = setup({ settings: { poolSize: 2, concurrency: 2 } });
    await holdWithPullRequest(events, 1, 10);
    await holdWithPullRequest(events, 2, 11);
    github.issues.set(3, validated(3));
    await daemon.tick(SIGNAL);
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([]);
    expect(events.typesOf('daemon')).toEqual(['scheduler.worktrees-full']);
    expect(notifier.titles).toEqual(['No worktree is free: issues wait']);
    expect(await activeWorktreeShortage(events)).toMatchObject({
      poolSize: 2,
      waiting: [3],
      holders: [
        { issueNumber: 1, state: 'pr-open', pullRequestNumber: 10 },
        { issueNumber: 2, state: 'pr-open', pullRequestNumber: 11 },
      ],
    });
    await events.append(PIPELINE_EVENTS.worktreeReleased, issueSubject(1), { path: '/pool/slot-1' });
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([3]);
    expect(events.typesOf('daemon')).toEqual(['scheduler.worktrees-full', 'scheduler.worktrees-free']);
    expect(await activeWorktreeShortage(events)).toBeNull();
    drivers.finish(3, { kind: 'needs-human', issueNumber: 3, reason: 'stop' });
    await daemon.settle();
  });

  it('leaves the shortage as it stands while a film holds the slots, and does not announce it again', async () => {
    const { github, daemon, notifier, events } = setup({ settings: { poolSize: 2, concurrency: 2 } });
    await holdWithPullRequest(events, 1, 10);
    await holdWithPullRequest(events, 2, 11);
    github.issues.set(3, validated(3));
    await daemon.tick(SIGNAL);
    await daemon.tick(SIGNAL, SLOTS_HELD);
    await daemon.tick(SIGNAL);
    expect(events.typesOf('daemon')).toEqual(['scheduler.worktrees-full']);
    expect(notifier.titles).toEqual(['No worktree is free: issues wait']);
  });

  it('records nothing when the concurrency limit alone holds an issue back', async () => {
    const { github, drivers, daemon, events } = setup({ settings: { poolSize: 2, concurrency: 1 } });
    github.issues.set(1, validated(1));
    github.issues.set(2, validated(2));
    await daemon.tick(SIGNAL);
    await daemon.tick(SIGNAL);
    expect(drivers.started).toEqual([1]);
    expect(events.typesOf('daemon')).toEqual([]);
    drivers.finish(1, { kind: 'needs-human', issueNumber: 1, reason: 'stop' });
    await daemon.settle();
  });
});

describe('the scan for ready pull requests', () => {
  class ControlledScanner implements PullRequestReadyScanner {
    scans = 0;
    failure: Error | null = null;
    private release: (() => void) | null = null;

    async scan(): Promise<readonly never[]> {
      this.scans += 1;
      if (this.failure !== null) throw this.failure;
      await new Promise<void>((resolve) => {
        this.release = resolve;
      });
      return [];
    }

    finish(): void {
      this.release?.();
    }
  }

  it('runs beside the tick, one scan at a time, and the daemon settles once it ends', async () => {
    const scanner = new ControlledScanner();
    const { daemon } = setup({ pullRequestReady: scanner });
    await daemon.tick(SIGNAL);
    await daemon.tick(SIGNAL);
    expect(scanner.scans).toBe(1);
    let settled = false;
    const settling = daemon.settle().then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);
    scanner.finish();
    await settling;
    await daemon.tick(SIGNAL);
    expect(scanner.scans).toBe(2);
    scanner.finish();
    await daemon.settle();
  });

  it('keeps running while scheduling is paused, since it starts no agent', async () => {
    const scanner = new ControlledScanner();
    const { daemon, events } = setup({ pullRequestReady: scanner });
    await pauseScheduling(events, 'operator', 'paused by the operator', null);
    await daemon.tick(SIGNAL);
    expect(scanner.scans).toBe(1);
    scanner.finish();
    await daemon.settle();
  });

  it('tells the operator when a scan fails and tries again at the next tick', async () => {
    const scanner = new ControlledScanner();
    scanner.failure = new Error('the forge answered HTTP 502');
    const { daemon, notifier } = setup({ pullRequestReady: scanner });
    await daemon.tick(SIGNAL);
    await daemon.settle();
    await daemon.tick(SIGNAL);
    await daemon.settle();
    expect(scanner.scans).toBe(2);
    expect(notifier.titles).toEqual(['Factory error: announcing ready pull requests', 'Factory error: announcing ready pull requests']);
  });
});
