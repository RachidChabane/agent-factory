import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunningProcess, ServiceProcesses } from '@agent-factory/application';

/** How much of a service's output is kept for the issue's logs. */
export const SERVICE_OUTPUT_LINES = 200;
const PS_EXECUTABLE = 'ps';
const START_TIME_FORMAT = 'lstart=';
const PS_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 100;
const LOG_EXTENSION = '.log';
const TERMINATE = 'SIGTERM';
const KILL = 'SIGKILL';
const NO_SIGNAL = 0;
const NEWLINE = '\n';
const PROCESS_GONE = 'ESRCH';
const UTF8 = 'utf8';

/** When the system says a process started, which tells it from a later process given the same id; null when none runs. */
export function processStartTime(pid: number): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(PS_EXECUTABLE, ['-o', START_TIME_FORMAT, '-p', String(pid)], { timeout: PS_TIMEOUT_MS }, (error, stdout) => {
      const started = String(stdout).trim();
      resolve(error === null && started !== '' ? started : null);
    });
  });
}

function signalGroup(pid: number, signal: NodeJS.Signals | typeof NO_SIGNAL): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === PROCESS_GONE) return false;
    throw error;
  }
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Asks every process of the group to stop, then kills what is left once the grace period is over. */
async function stopGroup(pid: number, graceMs: number): Promise<void> {
  if (!signalGroup(pid, TERMINATE)) return;
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!signalGroup(pid, NO_SIGNAL)) return;
    await pause(POLL_INTERVAL_MS);
  }
  signalGroup(pid, KILL);
}

class SpawnedService implements RunningProcess {
  readonly pid: number;
  readonly startedAt: string | null;
  private readonly child: ChildProcess;
  private readonly logPath: string;

  constructor(child: ChildProcess, pid: number, startedAt: string | null, logPath: string) {
    this.child = child;
    this.pid = pid;
    this.startedAt = startedAt;
    this.logPath = logPath;
  }

  running(): Promise<boolean> {
    return Promise.resolve(this.child.exitCode === null && this.child.signalCode === null);
  }

  async output(): Promise<string> {
    const text = await readFile(this.logPath, UTF8).catch(() => '');
    return text.trimEnd().split(NEWLINE).slice(-SERVICE_OUTPUT_LINES).join(NEWLINE);
  }

  stop(graceMs: number): Promise<void> {
    return stopGroup(this.pid, graceMs);
  }
}

/**
 * Starts each service in a process group of its own, so that stopping it stops every process it started, with its
 * output written to a file of the given directory. A service is never left to the shell that started the factory.
 */
export class SpawnServiceProcesses implements ServiceProcesses {
  private readonly logDirectory: string;

  constructor(logDirectory: string) {
    this.logDirectory = logDirectory;
  }

  async start(name: string, command: readonly string[], cwd: string, environment: Readonly<Record<string, string>>): Promise<RunningProcess> {
    await mkdir(this.logDirectory, { recursive: true });
    const logPath = join(this.logDirectory, `${name}-${randomUUID()}${LOG_EXTENSION}`);
    const log = await open(logPath, 'a');
    try {
      const [executable = '', ...args] = command;
      const child = spawn(executable, args, { cwd, env: environment, detached: true, stdio: ['ignore', log.fd, log.fd] });
      const pid = await new Promise<number>((resolve, reject) => {
        child.once('error', reject);
        child.once('spawn', () => resolve(child.pid ?? 0));
      });
      child.unref();
      return new SpawnedService(child, pid, await processStartTime(pid), logPath);
    } finally {
      await log.close();
    }
  }

  async reclaim(pid: number, startedAt: string, graceMs: number): Promise<boolean> {
    if ((await processStartTime(pid)) !== startedAt) return false;
    await stopGroup(pid, graceMs);
    return true;
  }
}
