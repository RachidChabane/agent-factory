import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DAEMON_STOPPED_EVENT,
  loadJournal,
  RUN_FINISHED_EVENT,
  RUN_STARTED_EVENT,
  RunFinishedPayloadSchema,
} from '@agent-factory/application';
import { openEventLog, type EventLog } from '../composition/event-log.ts';
import { openFactory } from '../composition/factory-container.ts';
import { factoryLockPath } from '../composition/factory-runtime.ts';
import { FACTORY_INSTALL_DIRECTORY } from '../composition/install-paths.ts';
import { SILENT_LOG } from '../composition/operation-log.ts';
import { createDaemon } from '../composition/use-cases.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, TEST_WEBHOOK_VARIABLE, waitFor, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';

const FAKE_CLAUDE = join(FACTORY_INSTALL_DIRECTORY, 'packages', 'adapters', 'src', 'claude', 'test-fixtures', 'fake-claude.ts');
const CLI = join(FACTORY_INSTALL_DIRECTORY, 'packages', 'server', 'src', 'cli', 'start.ts');
const TIMEOUT_MS = 60_000;
const SECOND_SIGNAL_DELAY_MS = 100;

function withoutWebhook(environment: Readonly<Record<string, string | undefined>>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => name !== TEST_WEBHOOK_VARIABLE));
}
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };

function descendantsOf(root: number): readonly number[] {
  const table = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const found: number[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const parent = queue.shift();
    for (const [pid, ppid] of table) {
      if (ppid === parent && pid !== undefined && !found.includes(pid)) {
        found.push(pid);
        queue.push(pid);
      }
    }
  }
  return found;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => child.once('exit', (code) => resolve(code)));
}

describe('factory start shutdown', () => {
  let rehearsal: RehearsalEnvironment;
  let eventLog: EventLog;
  let cli: ChildProcess | null = null;

  beforeEach(async () => {
    rehearsal = await createRehearsal({ claudeCommand: [process.execPath, FAKE_CLAUDE, '--fake-mode', 'hang'], minimumFreeMemoryPercent: 0 });
  });

  afterEach(async () => {
    if (cli !== null && cli.exitCode === null) cli.kill('SIGKILL');
    eventLog.close();
    await rehearsal.cleanup();
  });

  it(
    'aborts the running agent on SIGTERM, leaves no child process behind and resumes the issue on the next start',
    async () => {
      const issue = await rehearsal.addDocIssue('Document the shutdown');
      const output: string[] = [];
      cli = spawn(process.execPath, [CLI, 'start'], {
        env: { ...withoutWebhook(rehearsal.environment), AGENT_FACTORY_HOME: rehearsal.root },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      cli.stdout?.on('data', (chunk: Buffer) => output.push(chunk.toString()));
      cli.stderr?.on('data', (chunk: Buffer) => output.push(chunk.toString()));
      const exit = exited(cli);
      eventLog = openEventLog(rehearsal.config);
      const { events } = eventLog;
      await waitFor(async () => (await events.read('run/', 0)).some((record) => record.type === RUN_STARTED_EVENT), TIMEOUT_MS, `an agent run (${output.join('')})`);
      const cliPid = cli.pid ?? 0;
      const children = await waitFor(async () => {
        const found = descendantsOf(cliPid);
        return found.length > 0 ? found : null;
      }, TIMEOUT_MS, 'the claude child process');
      expect(existsSync(factoryLockPath(rehearsal.config))).toBe(true);

      cli.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, SECOND_SIGNAL_DELAY_MS));
      cli.kill('SIGTERM');
      expect(await exit).toBe(0);
      expect(output.join('')).toContain('SIGTERM received again');

      await waitFor(async () => children.every((pid) => !isAlive(pid)), TIMEOUT_MS, 'every child process to exit');
      expect(existsSync(factoryLockPath(rehearsal.config))).toBe(false);
      const records = await events.read('', 0);
      const finished = records.filter((record) => record.type === RUN_FINISHED_EVENT).map((record) => RunFinishedPayloadSchema.parse(record.payload));
      expect(finished.map((run) => run.status)).toEqual(['stopped']);
      expect(records.at(-1)?.type).toBe(DAEMON_STOPPED_EVENT);
      expect((await loadJournal(events, issue)).state).toBe('authoring-checks');

      const factory = await openFactory(rehearsal.config, rehearsal.environment, {
        harness: new RehearsalAgents(),
        resources: NORMAL_RESOURCES,
        log: SILENT_LOG,
      });
      const controller = new AbortController();
      try {
        const running = createDaemon(factory).run(controller.signal);
        await waitFor(async () => ((await loadJournal(events, issue)).state === 'pr-open' ? true : null), TIMEOUT_MS, 'the resumed issue');
        controller.abort();
        await running;
      } finally {
        factory.close();
      }
    },
    TIMEOUT_MS * 3,
  );
});
