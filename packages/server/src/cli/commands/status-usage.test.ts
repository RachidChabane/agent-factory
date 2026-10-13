import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventSourcedIssueStateStore } from '@agent-factory/adapters';
import { ProjectEventStore, type UsageReportSource } from '@agent-factory/application';
import type { AccountIdentity, IssueState, UsageReading } from '@agent-factory/domain';
import type { AgentFactoryConfig } from '../../config/agent-factory-config.ts';
import { openEventLog } from '../../composition/installation/event-log.ts';
import { openInstallation, type InstallationOverrides } from '../../composition/installation/installation-runtime.ts';
import { factoryLockPath } from '../../composition/runtime.ts';
import type { CliContext } from '../cli-context.ts';
import { runCli } from '../factory-cli.ts';
import { capturedOutput, cliContext, configText, NOW, parseConfig, type CapturedOutput } from '../testing/cli-harness.ts';

const FIVE_MINUTES_MS = 5 * 60_000;

function reading(account: string): UsageReading {
  return {
    account,
    source: 'usage-report',
    readAt: new Date(NOW.getTime() - FIVE_MINUTES_MS),
    limits: [
      { kind: 'session', scope: null, utilization: 0.41, resetsAt: new Date('2026-10-10T10:00:00.000Z') },
      { kind: 'weekly_all', scope: null, utilization: 0.12, resetsAt: new Date('2026-10-15T12:59:00.000Z') },
      { kind: 'weekly_scoped', scope: 'claude-opus-5-5', utilization: 0.07, resetsAt: null },
    ],
  };
}

class RecordedUsage implements UsageReportSource {
  readonly reads: string[] = [];
  failure: string | null = null;
  identity: AccountIdentity | null = null;

  read(account: string): Promise<UsageReading> {
    this.reads.push(account);
    return this.failure === null ? Promise.resolve({ ...reading(account), identity: this.identity }) : Promise.reject(new Error(this.failure));
  }
}

describe('status and usage of the whole installation', () => {
  let home: string;
  let config: AgentFactoryConfig;
  let captured: CapturedOutput;
  let usage: RecordedUsage;

  beforeEach(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), 'factory-status-')));
    config = parseConfig(configText(['widgets', 'gadgets']), home);
    captured = capturedOutput();
    usage = new RecordedUsage();
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  function context(): CliContext {
    const overrides: InstallationOverrides = { clock: { now: () => NOW }, usage, userHome: home, log: { info: () => undefined, warn: () => undefined } };
    return cliContext(home, captured, () => Promise.resolve(config), {
      openInstallation: (loaded, extra = {}) => openInstallation(loaded, { AGENT_FACTORY_HOME: home }, { ...overrides, ...extra }),
    });
  }

  it('reads the usage of every account now, by limit kind, each figure with the time it was read', async () => {
    expect(await runCli(['usage', '--refresh'], context())).toBe(0);
    expect(usage.reads).toEqual(['default']);
    expect(captured.lines).toEqual([
      'Account default (subscription): read 2026-10-10T07:55:00.000Z (5 min ago) from the Claude usage report',
      '  session: 41% used, pauses at 90%, resets 2026-10-10T10:00:00.000Z',
      '  weekly_all: 12% used, pauses at 85%, resets 2026-10-15T12:59:00.000Z',
      '  weekly_scoped (claude-opus-5-5): 7% used, pauses at 85%, reset time not reported',
      'Usage is read every 10 min; a reading older than 30 min counts as stale.',
    ]);
  });

  it('names the login each account reads its usage under', async () => {
    usage.identity = { email: 'alex.morgan@example.com', organization: 'Example Org', plan: 'max' };
    expect(await runCli(['usage', '--refresh'], context())).toBe(0);
    expect(captured.lines[0]).toBe('Account default (subscription, alex.morgan@example.com, max plan): read 2026-10-10T07:55:00.000Z (5 min ago) from the Claude usage report');
  });

  it('shows the last reading without reading again, and says when none was ever taken', async () => {
    expect(await runCli(['usage'], context())).toBe(0);
    expect(usage.reads).toEqual([]);
    expect(captured.lines[0]).toBe('Account default (subscription): never read; run "agent-factory usage --refresh"');
  });

  it('fails a refresh that could not read an account, and says why', async () => {
    usage.failure = 'claude exited with code 1: not logged in';
    expect(await runCli(['usage', '--refresh'], context())).toBe(1);
    expect(captured.lines).toContain('  last read failed 2026-10-10T08:00:00.000Z (just now): claude exited with code 1: not logged in');
  });

  it('gives the installation at a glance: the factory, its pauses, usage and every project', async () => {
    const eventLog = openEventLog(config.directories.state);
    const widgets = new EventSourcedIssueStateStore(new ProjectEventStore(eventLog.events, 'widgets'));
    await widgets.transition(3, 'spec-draft', 'taken');
    await widgets.transition(3, 'spec-validated', 'validated');
    await widgets.transition(4, 'spec-draft', 'taken');
    eventLog.close();

    expect(await runCli(['status'], context())).toBe(0);
    expect(captured.lines.slice(0, 5)).toEqual([
      `Installation ${home} (configuration ${home}/config.yaml)`,
      'Factory: not running',
      'Calm: yes (the factory is not running)',
      'Agent runs at a time: at most 1',
      'Pauses: none',
    ]);
    expect(captured.lines.slice(-5)).toEqual([
      'Projects:',
      '  widgets (Widgets) on GitHub acme/widgets',
      '    1 spec-draft, 1 spec-validated',
      `  gadgets (Gadgets) on the local forge of acme/gadgets (${home}/projects/gadgets/forge)`,
      '    no issue taken by the factory yet',
    ]);
  });

  describe('whether a restart would cut work short', () => {
    async function recordIssueStates(project: string, issueNumber: number, ...states: readonly IssueState[]): Promise<void> {
      const eventLog = openEventLog(config.directories.state);
      const store = new EventSourcedIssueStateStore(new ProjectEventStore(eventLog.events, project));
      for (const state of states) await store.transition(issueNumber, state, `to ${state}`);
      eventLog.close();
    }
    async function runningFactoryLock(): Promise<void> {
      await mkdir(config.directories.state, { recursive: true });
      await writeFile(factoryLockPath(config.directories.state), `${process.ppid}\n`);
    }

    it('is calm for a running factory with nothing in flight', async () => {
      await runningFactoryLock();
      expect(await runCli(['status'], context())).toBe(0);
      expect(captured.lines.slice(1, 3)).toEqual([`Factory: running as process ${process.ppid}, cockpit at ${config.server.publicUrl}`, 'Calm: yes']);
    });

    it('is not calm while a running factory works by itself on an issue, and says which', async () => {
      await runningFactoryLock();
      await recordIssueStates('widgets', 3, 'spec-draft', 'spec-validated', 'authoring-checks', 'checks-frozen', 'implementing', 'gating');
      expect(await runCli(['status'], context())).toBe(0);
      expect(captured.lines.slice(2, 4)).toEqual(['Calm: no', '  issue in a stage the factory runs by itself: widgets#3 is gating']);
    });

    it('is calm for a stopped factory, though its log still shows the stage it was in', async () => {
      await recordIssueStates('widgets', 3, 'spec-draft', 'spec-validated', 'authoring-checks', 'checks-frozen', 'implementing', 'gating');
      expect(await runCli(['status'], context())).toBe(0);
      expect(captured.lines.slice(1, 3)).toEqual(['Factory: not running', 'Calm: yes (the factory is not running)']);
    });
  });
});
