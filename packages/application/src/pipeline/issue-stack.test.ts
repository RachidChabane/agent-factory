import { describe, expect, it } from 'vitest';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import { EscalationRequiredError } from './pipeline-errors.ts';
import { IssueJournalWriter } from './journal-writer.ts';
import type { StackSettings } from './pipeline-settings.ts';
import { IssueStacks, STACK_EVENTS, STACK_SLOT_VARIABLE, StackSlots, StackStartError, type StackScope } from './issue-stack.ts';
import { ShellCommands } from './shell-commands.ts';
import { EventSourcedIssueStates, InMemoryLogArchive, RecordingSandbox, ScriptedCommandRunner, ScriptedServiceProcesses } from './testing/pipeline-fakes.ts';

const WORKSPACE = '/pool/slot-0';
const ISSUE = 42;
const SETUP = 'docker compose up -d --wait db';
const TEARDOWN = 'docker compose down --volumes';
const READY = 'curl -fsS http://127.0.0.1:$((19876 + AGENT_FACTORY_SLOT))/healthz';
const WAIT_FOR_READY = `until ${READY}; do sleep 1; done`;

const STACK: StackSettings = {
  setup: [{ name: 'database', run: SETUP, network: { reason: 'pulls the database image' } }],
  services: [{ name: 'web', run: 'npm run dev', ready: { run: READY, timeoutMs: 60_000 } }],
  teardown: [{ name: 'database', run: TEARDOWN }],
  environment: { DATABASE_URL: 'postgres://127.0.0.1:5434/shop' },
  issueTypes: ['ui'],
  stopGraceMs: 5_000,
};

function harness(settings: StackSettings | null = STACK) {
  const runner = new ScriptedCommandRunner();
  runner.on(SETUP, () => ({ exitCode: 0 })).on(TEARDOWN, () => ({ exitCode: 0 })).on(WAIT_FOR_READY, () => ({ exitCode: 0 }));
  const sandbox = new RecordingSandbox();
  const shell = new ShellCommands(runner, sandbox, { PATH: '/usr/bin' }, 60_000, null);
  const services = new ScriptedServiceProcesses();
  const logs = new InMemoryLogArchive();
  const events = new InMemoryEventStore();
  const slots = new StackSlots();
  const stacks = new IssueStacks({ services, logs, slots }, settings, shell);
  const writer = new IssueJournalWriter(events, new EventSourcedIssueStates(events), ISSUE);
  return { runner, sandbox, services, logs, events, slots, stacks, writer };
}

describe('the stack of an issue', () => {
  it('is needed by the issue types it names, by every type when it names none, and by none without a stack', () => {
    expect(harness().stacks.needed('ui')).toBe(true);
    expect(harness().stacks.needed('api')).toBe(false);
    expect(harness({ ...STACK, issueTypes: [] }).stacks.needed('api')).toBe(true);
    expect(harness(null).stacks.needed('ui')).toBe(false);
  });

  it('leaves the work of an issue type that needs no stack as it is', async () => {
    const { stacks, writer, services, events } = harness();
    expect(await stacks.around(writer, ISSUE, 'api', WORKSPACE, (scope) => Promise.resolve(scope))).toBeNull();
    expect(services.started).toEqual([]);
    expect(events.records).toEqual([]);
  });

  it('sets up, starts each service until it answers, does the work, then stops the services and tears down', async () => {
    const { stacks, writer, services, runner, sandbox, logs, events } = harness();
    let seen: StackScope | null = null;
    await stacks.around(writer, ISSUE, 'ui', WORKSPACE, (scope) => {
      seen = scope;
      expect(services.started[0]?.alive).toBe(true);
      return Promise.resolve();
    });
    expect(runner.executed.map((entry) => entry.command)).toEqual([SETUP, WAIT_FOR_READY, TEARDOWN]);
    expect(runner.executed.every((entry) => entry.env[STACK_SLOT_VARIABLE] === '0' && entry.env['DATABASE_URL'] === 'postgres://127.0.0.1:5434/shop')).toBe(true);
    expect(sandbox.scopes.every((scope) => scope.hostLoopback === true)).toBe(true);
    expect(services.started.map((process) => [process.name, process.command.at(-1), process.alive])).toEqual([['web', 'npm run dev', false]]);
    expect(seen).toMatchObject({ environment: { [STACK_SLOT_VARIABLE]: '0', DATABASE_URL: 'postgres://127.0.0.1:5434/shop' } });
    expect(await logs.read(ISSUE, 'stack-web.log')).toBe('web listening');
    expect(events.records.map((record) => [record.type, record.payload])).toEqual([
      [STACK_EVENTS.started, { workspace: WORKSPACE, slot: 0, services: [{ name: 'web', pid: 4_100, startedAt: 'started 4100' }] }],
      [STACK_EVENTS.stopped, { workspace: WORKSPACE, reclaimed: false, problems: [] }],
    ]);
  });

  it('gives the stacks of issues that run at once their own slots, and frees each slot after use', async () => {
    const { stacks, writer, slots } = harness();
    const slotsSeen: string[] = [];
    await stacks.around(writer, ISSUE, 'ui', WORKSPACE, async (outer) => {
      slotsSeen.push(outer?.environment[STACK_SLOT_VARIABLE] ?? '');
      await stacks.around(writer, ISSUE, 'ui', '/pool/slot-1', (inner) => {
        slotsSeen.push(inner?.environment[STACK_SLOT_VARIABLE] ?? '');
        return Promise.resolve();
      });
    });
    expect(slotsSeen).toEqual(['0', '1']);
    expect(slots.acquire()).toBe(0);
  });

  it('sends the issue to a person when a setup command fails, tearing down what it started', async () => {
    const { stacks, writer, runner, services, events, slots } = harness();
    runner.on(SETUP, () => ({ exitCode: 1, output: 'port 5434 is already allocated' }));
    const failure = stacks.around(writer, ISSUE, 'ui', WORKSPACE, () => Promise.resolve());
    await expect(failure).rejects.toBeInstanceOf(StackStartError);
    await expect(failure).rejects.toBeInstanceOf(EscalationRequiredError);
    await expect(failure).rejects.toThrow(/database failed:[\s\S]*port 5434 is already allocated/);
    expect(services.started).toEqual([]);
    expect(runner.count(TEARDOWN)).toBe(1);
    expect(events.records).toEqual([]);
    expect(slots.acquire()).toBe(0);
  });

  it('says which service never answered, with what it printed, and stops it', async () => {
    const { stacks, writer, runner, services, events } = harness();
    runner.on(WAIT_FOR_READY, () => ({ exitCode: 1, timedOut: true }));
    await expect(stacks.around(writer, ISSUE, 'ui', WORKSPACE, () => Promise.resolve())).rejects.toThrow(/web never answered: .*did not succeed within 60000 ms[\s\S]*web listening/);
    expect(services.started[0]?.alive).toBe(false);
    expect(events.records.map((record) => record.type)).toEqual([STACK_EVENTS.started, STACK_EVENTS.stopped]);
  });

  it('tears the stack down when the work fails, and lets the failure through', async () => {
    const { stacks, writer, services, runner } = harness();
    await expect(stacks.around(writer, ISSUE, 'ui', WORKSPACE, () => Promise.reject(new Error('the agent stopped')))).rejects.toThrow('the agent stopped');
    expect(services.started[0]?.alive).toBe(false);
    expect(runner.count(TEARDOWN)).toBe(1);
  });

  it('stops the stacks a factory that ended left running, once, and records that it did', async () => {
    const { stacks, writer, services, runner, events } = harness();
    await writer.record(STACK_EVENTS.started, { workspace: WORKSPACE, slot: 2, services: [{ name: 'web', pid: 777, startedAt: 'Mon Oct 12 09:00:00 2026' }] });
    const finished = new IssueJournalWriter(events, new EventSourcedIssueStates(events), 43);
    await finished.record(STACK_EVENTS.started, { workspace: '/pool/slot-1', slot: 1, services: [] });
    await finished.record(STACK_EVENTS.stopped, { workspace: '/pool/slot-1', reclaimed: false, problems: [] });
    const writerFor = (issueNumber: number) => new IssueJournalWriter(events, new EventSourcedIssueStates(events), issueNumber);
    expect(await stacks.reclaim(events, writerFor)).toBe(1);
    expect(services.reclaimed).toEqual([{ pid: 777, startedAt: 'Mon Oct 12 09:00:00 2026' }]);
    expect(runner.executed.map((entry) => [entry.command, entry.env[STACK_SLOT_VARIABLE]])).toEqual([[TEARDOWN, '2']]);
    expect(events.records.at(-1)).toMatchObject({ type: STACK_EVENTS.stopped, subject: 'issue/42', payload: { reclaimed: true } });
    expect(await stacks.reclaim(events, writerFor)).toBe(0);
  });
});
