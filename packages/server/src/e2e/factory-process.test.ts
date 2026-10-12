import { CommandAbortedError } from '@agent-factory/adapters';
import type { CommandResult } from '@agent-factory/application';
import { describe, expect, it } from 'vitest';
import { FactoryCli, type RunnerFor } from './factory-cli.ts';
import { FactoryProcess } from './factory-process.ts';

const ENTRY_ARGUMENTS = 2;
const LIFETIME_LIMIT_MS = 600_000;
const DEADLINE_MS = 20;

function result(overrides: Partial<CommandResult> = {}): CommandResult {
  return { exitCode: 0, stdout: '', stderr: '', durationMs: 5, timedOut: false, ...overrides };
}

/** A factory that runs until it is asked to stop, if it obeys, or until it is killed. */
class FakeFactory {
  stopRequests = 0;
  private readonly obeys: boolean;
  /** Ends the factory as if it stopped by itself. */
  finish: () => void = () => undefined;

  constructor(obeys: boolean) {
    this.obeys = obeys;
  }

  readonly runnerFor: RunnerFor = (signal) => ({
    run: (command) => {
      const [verb] = command.slice(ENTRY_ARGUMENTS);
      if (verb === 'stop') {
        this.stopRequests += 1;
        if (this.obeys) this.finish();
        return Promise.resolve(result({ stdout: 'Asked the factory to stop now\n' }));
      }
      return new Promise<CommandResult>((resolve, reject) => {
        this.finish = () => resolve(result({ stdout: 'Factory started on storefront\nFactory stopped\n' }));
        signal.addEventListener('abort', () => reject(new CommandAbortedError(command)), { once: true });
      });
    },
  });
}

function processOf(factory: FakeFactory): FactoryProcess {
  const cli = new FactoryCli({ entry: 'main.ts', workingDirectory: '/factory', environment: {}, commandTimeoutMs: 60_000 }, factory.runnerFor, new AbortController().signal);
  return FactoryProcess.start(cli, LIFETIME_LIMIT_MS);
}

describe('FactoryProcess', () => {
  it('runs until it is stopped, then hands on the run of the factory itself', async () => {
    const factory = new FakeFactory(true);
    const running = processOf(factory);
    expect(running.endedRun()).toBeNull();
    const run = await running.stop(DEADLINE_MS);
    expect(run).toMatchObject({ command: 'agent-factory start', exitCode: 0, killed: false });
    expect(run.output).toContain('Factory stopped');
    expect(running.endedRun()).toBe(run);
    expect(factory.stopRequests).toBe(1);
  });

  it('is killed when it does not end within the deadline of the stop', async () => {
    const factory = new FakeFactory(false);
    const run = await processOf(factory).stop(DEADLINE_MS);
    expect(run.killed).toBe(true);
    expect(factory.stopRequests).toBe(1);
  });

  it('is stopped once however many times it is asked to stop', async () => {
    const factory = new FakeFactory(true);
    const running = processOf(factory);
    const [first, second] = await Promise.all([running.stop(DEADLINE_MS), running.stop(DEADLINE_MS)]);
    expect(second).toBe(first);
    expect(factory.stopRequests).toBe(1);
  });

  it('is killed all the same when the command that asks it to stop cannot run', async () => {
    const factory = new FakeFactory(true);
    const cli = new FactoryCli(
      { entry: 'main.ts', workingDirectory: '/factory', environment: {}, commandTimeoutMs: 60_000 },
      (signal) => ({
        run: (command, cwd, timeoutMs, env) => (command[ENTRY_ARGUMENTS] === 'stop' ? Promise.reject(new Error('spawn node EAGAIN')) : factory.runnerFor(signal).run(command, cwd, timeoutMs, env)),
      }),
      new AbortController().signal,
    );
    const run = await FactoryProcess.start(cli, LIFETIME_LIMIT_MS).stop(DEADLINE_MS);
    expect(run.killed).toBe(true);
  });

  it('asks for no stop of a factory that has already ended by itself', async () => {
    const factory = new FakeFactory(true);
    const running = processOf(factory);
    factory.finish();
    await new Promise((resolve) => setImmediate(resolve));
    expect(running.endedRun()).not.toBeNull();
    const run = await running.stop(DEADLINE_MS);
    expect(run.exitCode).toBe(0);
    expect(factory.stopRequests).toBe(0);
  });
});
