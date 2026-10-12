import { CommandAbortedError } from '@agent-factory/adapters';
import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { describe, expect, it } from 'vitest';
import { ExpectationFailed } from './expectations.ts';
import { describeCommand, endNote, expectSucceeded, FactoryCli, type CliRun, type FactoryCliSettings, type RunnerFor } from './factory-cli.ts';

const ENTRY = '/factory/packages/server/src/cli/main.ts';
const SETTINGS: FactoryCliSettings = { entry: ENTRY, workingDirectory: '/factory', environment: { AGENT_FACTORY_HOME: '/work/home' }, commandTimeoutMs: 60_000 };
const LIFETIME_LIMIT_MS = 600_000;

function result(overrides: Partial<CommandResult> = {}): CommandResult {
  return { exitCode: 0, stdout: '', stderr: '', durationMs: 5, timedOut: false, ...overrides };
}

interface Call {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly env: Readonly<Record<string, string>>;
}

function answering(outcome: CommandResult, calls: Call[] = []): RunnerFor {
  const runner: CommandRunner = {
    run: (command, cwd, timeoutMs, env) => {
      calls.push({ command, cwd, timeoutMs, env });
      return Promise.resolve(outcome);
    },
  };
  return () => runner;
}

/** Runs until its signal aborts, as a process that has to be killed. */
const untilAborted: RunnerFor = (signal) => ({
  run: (command) =>
    new Promise<CommandResult>((_resolve, reject) => {
      const abort = (): void => reject(new CommandAbortedError(command));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }),
});

function runOf(overrides: Partial<CliRun> = {}): CliRun {
  return { command: 'agent-factory merge 2 --expected-head abc', exitCode: 0, output: '', durationMs: 5, timedOut: false, killed: false, ...overrides };
}

describe('FactoryCli', () => {
  it('runs the command line with the Node that runs the example, in the environment of the factory home', async () => {
    const calls: Call[] = [];
    const cli = new FactoryCli(SETTINGS, answering(result({ stdout: 'out\n', stderr: 'err\n', durationMs: 12 }), calls), new AbortController().signal);
    const run = await cli.run(['status', '1']);
    expect(calls).toEqual([{ command: [process.execPath, ENTRY, 'status', '1'], cwd: '/factory', timeoutMs: 60_000, env: { AGENT_FACTORY_HOME: '/work/home' } }]);
    expect(run).toEqual({ command: 'agent-factory status 1', exitCode: 0, output: 'out\nerr\n', durationMs: 12, timedOut: false, killed: false });
  });

  it('keeps what each command printed, in the order the commands ended', async () => {
    const cli = new FactoryCli(SETTINGS, answering(result({ stdout: 'ok\n' })), new AbortController().signal);
    await cli.run(['validate', '--offline']);
    await cli.run(['status', '1']);
    expect(cli.transcript().map((run) => run.command)).toEqual(['agent-factory validate --offline', 'agent-factory status 1']);
  });

  it('reports a command ended from outside as killed', async () => {
    const lifetime = new AbortController();
    const cli = new FactoryCli(SETTINGS, untilAborted, lifetime.signal);
    const running = cli.run(['run-issue', '1']);
    lifetime.abort();
    expect(await running).toMatchObject({ command: 'agent-factory run-issue 1', killed: true });
  });

  it('lets a launched command be killed without ending the run', async () => {
    const cli = new FactoryCli(SETTINGS, untilAborted, new AbortController().signal);
    const launched = cli.launch(['start'], LIFETIME_LIMIT_MS);
    launched.kill();
    expect(await launched.finished).toMatchObject({ command: 'agent-factory start', killed: true });
    expect(cli.transcript()).toHaveLength(1);
  });

  it('hands on a failure to start a command that is run to its end', async () => {
    const failing: RunnerFor = () => ({ run: () => Promise.reject(new Error('spawn node ENOENT')) });
    await expect(new FactoryCli(SETTINGS, failing, new AbortController().signal).run(['status'])).rejects.toThrow('spawn node ENOENT');
  });

  it('reports a launched command that could not start as a run that ended, saying why', async () => {
    const failing: RunnerFor = () => ({ run: () => Promise.reject(new Error('spawn node ENOENT')) });
    const cli = new FactoryCli(SETTINGS, failing, new AbortController().signal);
    const run = await cli.launch(['start'], LIFETIME_LIMIT_MS).finished;
    expect(run).toMatchObject({ command: 'agent-factory start', exitCode: -1, output: 'could not start: spawn node ENOENT', killed: false });
    expect(cli.transcript()).toEqual([run]);
  });
});

describe('expectSucceeded', () => {
  it('lets a command that exited with 0 through', () => {
    const run = runOf({ output: 'Pull request #2 of storefront#1 merged as abc' });
    expect(expectSucceeded(run)).toBe(run);
  });

  it('fails a command that exited with another code, and shows what it printed', () => {
    const run = runOf({ exitCode: 1, output: 'Merge of pull request #2 refused: checks still running: gate (pending)\n' });
    expect(() => expectSucceeded(run)).toThrow(ExpectationFailed);
    expect(() => expectSucceeded(run)).toThrow('agent-factory merge 2 --expected-head abc succeeds');
    expect(() => expectSucceeded(run)).toThrow('found:    exit code 1');
    expect(() => expectSucceeded(run)).toThrow('Merge of pull request #2 refused: checks still running: gate (pending)');
  });

  it('fails a command that timed out or was killed even when its code reads as success', () => {
    expect(() => expectSucceeded(runOf({ timedOut: true }))).toThrow('(timed out)');
    expect(() => expectSucceeded(runOf({ killed: true }))).toThrow('(killed)');
  });
});

describe('endNote', () => {
  it('says how a run that did not exit ended, and nothing of one that did', () => {
    expect(endNote(runOf())).toBeNull();
    expect(endNote(runOf({ killed: true }))).toBe('killed');
    expect(endNote(runOf({ timedOut: true }))).toBe('timed out');
  });
});

describe('describeCommand', () => {
  it('writes a command as it is typed', () => {
    expect(describeCommand(['issue', 'create', '/work/spec.md', '--start'])).toBe('agent-factory issue create /work/spec.md --start');
  });
});
