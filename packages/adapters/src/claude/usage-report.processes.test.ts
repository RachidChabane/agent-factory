import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandAbortedError } from '../process/errors.ts';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { isAlive, killIfAlive, parsePids, waitUntilGone } from '../process/testSupport.ts';
import { STUCK_CLAUDE_PIDS_VARIABLE, STUCK_CLAUDE_SCRIPT } from './test-fixtures/stuck-claude-protocol.ts';
import { ClaudeUsageReport, UsageReportError } from './usage-report.ts';

const PROBE_TIMEOUT_MS = 3_000;
const KILL_GRACE_MS = 200;
const STARTED_PROCESSES = 2;
const START_DEADLINE_MS = 20_000;
const POLL_INTERVAL_MS = 50;
const CLOCK = { now: () => new Date('2026-10-12T09:45:00.000Z') };

describe('the usage probe against a Claude CLI that never answers', () => {
  let directory: string;
  let pidsFile: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'usage-probe-'));
    pidsFile = join(directory, 'pids');
  });

  afterEach(async () => {
    for (const pid of await startedProcesses()) killIfAlive(pid);
    await rm(directory, { recursive: true, force: true });
  });

  async function startedProcesses(): Promise<readonly number[]> {
    return parsePids(await readFile(pidsFile, 'utf8').catch(() => ''));
  }

  async function untilStarted(): Promise<readonly number[]> {
    const deadline = Date.now() + START_DEADLINE_MS;
    for (;;) {
      const processes = await startedProcesses();
      if (processes.length === STARTED_PROCESSES) return processes;
      if (Date.now() > deadline) throw new Error('the probe never started its processes');
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  function probe(): ClaudeUsageReport {
    return new ClaudeUsageReport((signal) => new SpawnCommandRunner({ abortSignal: signal, killGraceMs: KILL_GRACE_MS }), CLOCK, {
      command: [process.execPath, STUCK_CLAUDE_SCRIPT],
      accountDirectories: {},
      environment: { PATH: process.env['PATH'] ?? '', [STUCK_CLAUDE_PIDS_VARIABLE]: pidsFile },
      workingDirectory: directory,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
  }

  it('stops the command and everything it started when the probe times out', async () => {
    await expect(probe().read('default', new AbortController().signal)).rejects.toThrow(UsageReportError);
    const processes = await untilStarted();
    for (const pid of processes) expect(await waitUntilGone(pid)).toBe(true);
  });

  it('stops the command and everything it started when the factory stops', async () => {
    const controller = new AbortController();
    const outcome = probe().read('default', controller.signal).catch((error: unknown) => error);
    const processes = await untilStarted();
    for (const pid of processes) expect(isAlive(pid)).toBe(true);
    controller.abort();
    expect(await outcome).toBeInstanceOf(CommandAbortedError);
    for (const pid of processes) expect(await waitUntilGone(pid)).toBe(true);
  });
});
