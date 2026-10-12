import {
  AGENT_ROLES,
  BILLING_MODES,
  PAUSE_CAUSES,
  TOOL_STATUSES,
  USAGE_FRESHNESS,
  USAGE_LIMIT_KINDS,
  tokensWithCache,
  tokensWithoutCache,
} from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_SOURCE_KINDS, type TokenTotals, type ToolView } from '../../../contract/index.ts';
import { CONFIGURATION_PATH } from '../installation.ts';
import { DAY_MS, MINUTE_MS } from '../time.ts';
import { ledger, NOW, required, snapshot, storefront } from './world-under-test.ts';

function setOf<Value>(values: readonly Value[]): Set<Value> {
  return new Set(values);
}

function expectConsistent(totals: TokenTotals): void {
  const usage = { inputTokens: totals.input, outputTokens: totals.output, cacheReadTokens: totals.cacheRead, cacheCreationTokens: totals.cacheCreation };
  expect(totals.withoutCache).toBe(tokensWithoutCache(usage));
  expect(totals.withCache).toBe(tokensWithCache(usage));
}

const projectTools: readonly ToolView[] = snapshot.projects.flatMap((project) => project.tools);

describe('the knowledge of the world', () => {
  const sources = snapshot.projects.flatMap((project) => project.knowledge);

  it('comes from folders and from other repositories', () => {
    expect(setOf(sources.map((source) => source.kind))).toEqual(setOf(KNOWLEDGE_SOURCE_KINDS));
  });

  it('is listed fresh, listed from an earlier read after an error, or not listed yet', () => {
    const readings = sources.map((source) => source.documents);
    expect(readings.some((reading) => reading.value !== null && reading.error === null)).toBe(true);
    expect(readings.some((reading) => reading.value !== null && reading.readAt !== null && reading.error !== null)).toBe(true);
    expect(readings.some((reading) => reading.value === null && reading.readAt === null && reading.error === null)).toBe(true);
  });
});

describe('the tools of the world', () => {
  it('cover every status of a tool and a tool that was never checked', () => {
    expect(setOf(projectTools.flatMap((tool) => (tool.status === null ? [] : [tool.status])))).toEqual(setOf(TOOL_STATUSES));
    const never = required(
      projectTools.find((tool) => tool.status === null),
      'unchecked tool',
    );
    expect([never.version, never.checkedAt, never.detail]).toEqual([null, null, null]);
    expect(projectTools.some((tool) => tool.fixCommand !== null && tool.installHint !== null)).toBe(true);
  });

  it('give a few tools a declared login, what it did last, and a scheduled keep-alive in each state', () => {
    const withLogin = storefront.tools.filter((tool) => tool.loginCommand !== null);
    expect(withLogin.map((tool) => tool.name)).toEqual(['gh', 'registry-login', 'infra-plan']);
    const gh = required(withLogin.find((tool) => tool.name === 'gh'), 'gh');
    expect(gh.lastLogin?.outcome).toBe('succeeded');
    expect(gh.keepAlive?.last?.outcome).toBe('succeeded');
    expect(NOW - Date.parse(required(gh.keepAlive?.last?.at, 'keep-alive run'))).toBeLessThan((gh.keepAlive?.everyMinutes ?? 0) * MINUTE_MS);
    expect(required(withLogin.find((tool) => tool.name === 'registry-login'), 'registry login').lastLogin?.outcome).toBe('timed-out');
    const never = required(withLogin.find((tool) => tool.name === 'infra-plan'), 'infra-plan');
    expect([never.lastLogin, never.keepAlive?.last]).toEqual([null, null]);
    expect(setOf(withLogin.flatMap((tool) => (tool.lastLogin === null ? [] : [tool.lastLogin.outcome])))).toEqual(setOf(['succeeded', 'timed-out']));
    expect(projectTools.filter((tool) => tool.loginCommand === null).every((tool) => tool.lastLogin === null && tool.keepAlive === null)).toBe(true);
    expect(snapshot.tools.every((tool) => tool.loginCommand === null && tool.lastLogin === null && tool.keepAlive === null)).toBe(true);
  });

  it('list the built-in tools of the installation and one that is declared', () => {
    expect(snapshot.tools.map((tool) => tool.name)).toEqual(['git', 'claude', 'sandbox', 'tailscale']);
    expect(snapshot.tools.filter((tool) => tool.builtIn).map((tool) => tool.name)).toEqual(['git', 'claude', 'sandbox']);
    expect(snapshot.tools.every((tool) => tool.scope === 'installation')).toBe(true);
    expect(projectTools.every((tool) => tool.scope === 'project')).toBe(true);
    expect(storefront.tools.some((tool) => tool.name === 'gh' && tool.builtIn)).toBe(true);
    expect(ledger.tools.some((tool) => tool.name === 'gh')).toBe(false);
  });
});

describe('the settings of the world', () => {
  it('give each project a role for every agent, a prompt override in one of them and a concurrency within its ceiling', () => {
    for (const project of snapshot.projects) {
      expect(project.settings.roles.map((setting) => setting.role).sort()).toEqual([...AGENT_ROLES].sort());
      expect(project.settings.concurrency.issues).toBeLessThanOrEqual(project.settings.concurrency.ceiling);
      expect(project.settings.branchPrefix).toBe('factory/');
      expect(project.settings.labels).toEqual({ factory: 'factory', validated: 'spec:validated', audit: 'audit', kindPrefix: 'kind:' });
    }
    expect(storefront.settings.overriddenPrompts.length).toBeGreaterThan(0);
    expect(ledger.settings.overriddenPrompts).toEqual([]);
  });

  it('run commands with and without the network, before and after the acceptance checks', () => {
    const setup = storefront.settings.setup;
    expect(setup.some((entry) => entry.network !== null)).toBe(true);
    expect(setup.some((entry) => entry.network === null)).toBe(true);
    expect(storefront.settings.gate.beforeAcceptance.length).toBeGreaterThan(0);
    expect(storefront.settings.gate.afterAcceptance.length).toBeGreaterThan(0);
    expect(storefront.settings.gate.timeoutMinutes).toBeGreaterThan(0);
    expect(storefront.settings.environmentVariables.length).toBeGreaterThan(0);
  });

  it('name the other automations by branch and by author', () => {
    const automations = storefront.settings.automations;
    expect(automations.length).toBeGreaterThanOrEqual(2);
    expect(automations.some((automation) => automation.branches.length > 0 && automation.authors.length > 0)).toBe(true);
    expect(automations.some((automation) => automation.authors.length === 0)).toBe(true);
    expect(ledger.settings.automations).toEqual([]);
  });

  it('give the installation its models, its default roles, its limits and its channels', () => {
    const settings = snapshot.settings;
    expect(settings.models).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
    expect(settings.defaultRoles).toHaveLength(7);
    expect(settings.resources).toEqual({ minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal', maxConcurrentRuns: 3 });
    expect(Object.fromEntries(settings.notifications.map((channel) => [channel.kind, channel.configured]))).toEqual({ system: true, slack: true, 'google-chat': false, webhook: true });
    expect(['none', 'tailscale']).toContain(settings.remoteAccess);
    for (const run of snapshot.runs) expect(settings.models).toContain(run.model);
  });

  it('name the configuration file and report nothing pending from its last reload', () => {
    expect(snapshot.settings.configuration).toEqual({ path: CONFIGURATION_PATH, restartRequired: [], reloadFailure: null });
  });
});

describe('the pauses of the world', () => {
  it('pause the installation for lack of memory and the ledger on the order of the operator', () => {
    expect(snapshot.installation.pauses).toHaveLength(1);
    const installationPause = required(snapshot.installation.pauses[0], 'installation pause');
    expect([installationPause.scope, installationPause.cause, installationPause.resumesAt]).toEqual(['installation', 'resources', null]);
    expect(PAUSE_CAUSES).toContain(installationPause.cause);
    expect(ledger.pauses).toHaveLength(1);
    expect([ledger.pauses[0]?.scope, ledger.pauses[0]?.cause, ledger.pauses[0]?.resumesAt]).toEqual(['project', 'operator', null]);
    expect(storefront.pauses).toEqual([]);
    expect(snapshot.resources.schedulingPaused).toBe(true);
  });

  it('keep the sample of the machine above the threshold that triggered the pause', () => {
    const sample = required(snapshot.resources.sample.value, 'sample');
    expect([sample.freeMemoryPercent, sample.pressure]).toEqual([63, 'normal']);
    expect(snapshot.resources.minimumFreeMemoryPercent).toBe(40);
    expect(snapshot.resources.pauseAbovePressure).toBe('normal');
    expect(NOW - Date.parse(required(snapshot.resources.sample.readAt, 'sample time'))).toBeLessThanOrEqual(30_000);
    expect(snapshot.resources.sample.error).toBeNull();
    expect(required(snapshot.installation.pauses[0], 'pause').reason).toMatch(/^free memory \d+% is below 40%$/);
  });
});

describe('the subscription usage of the world', () => {
  const [personal, shared] = snapshot.usage.accounts;

  it('reads two accounts, one by subscription and one by key', () => {
    expect(snapshot.usage.accounts.map((account) => account.name)).toEqual(['personal', 'shared']);
    expect(setOf(snapshot.usage.accounts.map((account) => account.billing))).toEqual(setOf(BILLING_MODES));
    expect([snapshot.usage.refreshMinutes, snapshot.usage.staleAfterMinutes]).toEqual([15, 45]);
  });

  it('gives the subscription a limit of every kind and every freshness', () => {
    const account = required(personal, 'personal account');
    expect(setOf(account.limits.map((limit) => limit.kind))).toEqual(setOf(USAGE_LIMIT_KINDS));
    expect(setOf(account.limits.map((limit) => limit.freshness))).toEqual(setOf(USAGE_FRESHNESS));
    expect(setOf(account.limits.map((limit) => `${limit.kind}/${limit.scope ?? ''}`)).size).toBe(account.limits.length);
    const session = required(account.limits.find((limit) => limit.kind === 'session'), 'session limit');
    expect([session.utilization, session.pauseAt, session.freshness]).toEqual([0.42, 0.9, 'fresh']);
    const weekly = required(account.limits.find((limit) => limit.kind === 'weekly_all'), 'weekly limit');
    expect([weekly.utilization, weekly.pauseAt]).toEqual([0.63, 0.85]);
    const reset = required(account.limits.find((limit) => limit.freshness === 'window-reset'), 'reset window');
    expect(Date.parse(required(reset.resetsAt, 'reset time'))).toBeLessThan(NOW);
    expect(account.limits.filter((limit) => limit.kind === 'weekly_scoped').every((limit) => limit.scope !== null)).toBe(true);
    expect([account.source, account.lastFailure]).toEqual(['usage-report', null]);
    expect(NOW - Date.parse(required(account.readAt, 'reading time'))).toBeLessThanOrEqual(20 * MINUTE_MS);
  });

  it('keeps the account billed by key without limits, with the reason it could not be read', () => {
    const account = required(shared, 'shared account');
    expect([account.limits, account.source, account.readAt]).toEqual([[], null, null]);
    expect(account.lastFailure?.reason.length).toBeGreaterThan(0);
  });
});

describe('the costs of the world', () => {
  const { costs } = snapshot;

  it('state what the figures mean and what limits them', () => {
    expect(costs.basis).toBe('subscription-equivalent');
    expect(costs.dailyCap).toEqual({ kind: 'none' });
    expect(costs.perRunCapUsd).toBe(5);
  });

  it('give two weeks of days that end today, with token totals that add up', () => {
    expect(costs.daily).toHaveLength(14);
    expect(costs.daily.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date))).toBe(true);
    const dates = costs.daily.map((day) => Date.parse(day.date));
    dates.slice(1).forEach((date, position) => expect(date - required(dates[position], 'previous day')).toBe(DAY_MS));
    expect(costs.daily.at(-1)?.date).toBe(new Date(NOW).toISOString().slice(0, 10));
    expect(costs.today).toEqual({ date: costs.daily.at(-1)?.date, costUsd: costs.daily.at(-1)?.costUsd, runs: costs.daily.at(-1)?.runs });
    for (const entry of [costs.tokens, ...costs.daily.map((day) => day.tokens), ...costs.byProject.map((item) => item.tokens), ...costs.byRole.map((item) => item.tokens), ...costs.byModel.map((item) => item.tokens), ...costs.byIssue.map((item) => item.tokens)]) {
      expectConsistent(entry);
    }
    expect(costs.tokens.withCache).toBeGreaterThan(costs.tokens.withoutCache * 10);
  });

  it('add up per day, per project, per role and per model', () => {
    const totalOfRuns = snapshot.runs.reduce((sum, run) => sum + run.costUsd, 0);
    const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
    const inMonth = costs.daily.filter((day) => day.date.startsWith(costs.today.date.slice(0, 7)));
    expect(costs.monthToDateUsd).toBeCloseTo(sum(inMonth.map((day) => day.costUsd)), 3);
    expect(sum(costs.byRole.map((entry) => entry.costUsd))).toBeCloseTo(totalOfRuns, 3);
    expect(sum(costs.byModel.map((entry) => entry.costUsd))).toBeCloseTo(totalOfRuns, 3);
    const projectRuns = snapshot.runs.filter((run) => run.project !== null).reduce((total, run) => total + run.costUsd, 0);
    expect(sum(costs.byProject.map((entry) => entry.costUsd))).toBeCloseTo(projectRuns, 3);
    expect(costs.byProject.map((entry) => entry.key).sort()).toEqual(['ledger', 'storefront']);
    expect(costs.byRole.map((entry) => entry.key).sort()).toEqual([...AGENT_ROLES].sort());
    expect(costs.byModel).toHaveLength(3);
  });

  it('name the issues that cost the most, whatever their project', () => {
    const numbers = costs.byIssue.map((entry) => entry.issueNumber);
    expect(numbers.filter((number, position) => numbers.indexOf(number) !== position).length).toBeGreaterThanOrEqual(2);
    expect(setOf(costs.byIssue.map((entry) => entry.project))).toEqual(setOf(['storefront', 'ledger']));
    const ordered = costs.byIssue.map((entry) => entry.costUsd);
    expect(ordered).toEqual([...ordered].sort((left, right) => right - left));
    for (const entry of costs.byIssue) {
      const project = required(snapshot.projects.find((candidate) => candidate.id === entry.project), 'project of entry');
      expect(project.issues.find((issue) => issue.number === entry.issueNumber)?.costUsd).toBeCloseTo(entry.costUsd, 3);
    }
  });
});
