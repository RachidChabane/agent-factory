import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DAEMON_STOPPED_EVENT,
  loadJournal,
  ProjectEventStore,
  RUN_FINISHED_EVENT,
  RUN_STARTED_EVENT,
  RunFinishedPayloadSchema,
} from '@agent-factory/application';
import { createDaemons } from '../composition/installation-daemon.ts';
import { openEventLog, type EventLog } from '../composition/installation/event-log.ts';
import { openInstallation } from '../composition/installation/installation-runtime.ts';
import { FACTORY_INSTALL_DIRECTORY } from '../composition/install-paths.ts';
import { SILENT_LOG } from '../composition/operation-log.ts';
import { factoryLockPath } from '../composition/runtime.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, FIRST_PROJECT, TEST_WEBHOOK_VARIABLE, waitFor, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';

const FAKE_CLAUDE = join(FACTORY_INSTALL_DIRECTORY, 'packages', 'adapters', 'src', 'claude', 'test-fixtures', 'fake-claude.ts');
const CLI = join(FACTORY_INSTALL_DIRECTORY, 'packages', 'server', 'src', 'cli', 'main.ts');
const TIMEOUT_MS = 60_000;

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
      const issue = await rehearsal.project(FIRST_PROJECT).addDocIssue('Document the shutdown');
      const lockPath = factoryLockPath(rehearsal.config.directories.state);
      const output: string[] = [];
      cli = spawn(process.execPath, [CLI, 'start'], {
        env: { ...withoutWebhook(rehearsal.environment), AGENT_FACTORY_HOME: rehearsal.root },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      cli.stdout?.on('data', (chunk: Buffer) => output.push(chunk.toString()));
      cli.stderr?.on('data', (chunk: Buffer) => output.push(chunk.toString()));
      const exit = exited(cli);
      eventLog = openEventLog(rehearsal.config.directories.state);
      const { events } = eventLog;
      const projectEvents = new ProjectEventStore(events, FIRST_PROJECT);
      await waitFor(async () => (await events.read('run/', 0)).some((record) => record.type === RUN_STARTED_EVENT), TIMEOUT_MS, `an agent run (${output.join('')})`);
      const cliPid = cli.pid ?? 0;
      const children = await waitFor(async () => {
        const found = descendantsOf(cliPid);
        return found.length > 0 ? found : null;
      }, TIMEOUT_MS, 'the claude child process');
      expect(existsSync(lockPath)).toBe(true);

      cli.kill('SIGTERM');
      expect(await exit).toBe(0);
      expect(output.join('')).toContain('SIGTERM received; stopping');

      await waitFor(async () => children.every((pid) => !isAlive(pid)), TIMEOUT_MS, 'every child process to exit');
      expect(existsSync(lockPath)).toBe(false);
      const records = await events.read('', 0);
      const finished = records.filter((record) => record.type === RUN_FINISHED_EVENT).map((record) => RunFinishedPayloadSchema.parse(record.payload));
      expect(finished.map((run) => run.status)).toEqual(['stopped']);
      expect(records.at(-1)?.type).toBe(DAEMON_STOPPED_EVENT);
      expect((await loadJournal(projectEvents, issue)).state).toBe('authoring-checks');

      const agents = new RehearsalAgents();
      const installation = await openInstallation(rehearsal.config, rehearsal.environment, {
        harnessFor: () => agents,
        resources: NORMAL_RESOURCES,
        log: SILENT_LOG,
        userHome: rehearsal.root,
      });
      const controller = new AbortController();
      try {
        const running = createDaemons(installation).installation.run(controller.signal);
        await waitFor(async () => ((await loadJournal(projectEvents, issue)).state === 'pr-open' ? true : null), TIMEOUT_MS, 'the resumed issue');
        controller.abort();
        await running;
      } finally {
        installation.close();
      }
    },
    TIMEOUT_MS * 3,
  );
});
