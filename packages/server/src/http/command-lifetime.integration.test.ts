import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UsageReportSource } from '@agent-factory/application';
import { openInstallation, type InstallationRuntime } from '../composition/installation/installation-runtime.ts';
import { SILENT_LOG } from '../composition/operation-log.ts';
import { isAlive, killProcessTree } from '../testing/process-table.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, FIRST_PROJECT, waitFor, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import { dispatchCommand } from './commands.ts';
import { SequenceCursor } from './sequence-cursor.ts';

const TIMEOUT_MS = 60_000;
const OPERATOR = 'alex';
const PORTAL = 'portal';
const LOGIN_PID_FILE = 'portal-login.pid';
const READ_STOPPED = 'the usage read was stopped';
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };
/** A login that waits for the operator in a browser: it records its process id and never ends by itself. */
const WAITING_LOGIN = `echo $$ > "$AGENT_FACTORY_HOME/${LOGIN_PID_FILE}"; exec sleep 300`;

describe('the commands of the cockpit that start a process, when the factory stops', () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;
  let lifetime: AbortController;
  const usageReads: AbortSignal[] = [];

  const usage: UsageReportSource = {
    read: (_account, signal) =>
      new Promise((_resolve, reject) => {
        usageReads.push(signal);
        const stop = (): void => reject(new Error(READ_STOPPED));
        if (signal.aborted) stop();
        else signal.addEventListener('abort', stop, { once: true });
      }),
  };

  async function loginProcess(): Promise<number | null> {
    const pid = Number.parseInt(await readFile(join(rehearsal.root, LOGIN_PID_FILE), 'utf8').catch(() => ''), 10);
    return Number.isNaN(pid) ? null : pid;
  }

  function send(name: string, body: unknown) {
    const context = { runtime: installation, daemons: null, operator: OPERATOR, lifetime: lifetime.signal };
    return dispatchCommand(name, body, context, new SequenceCursor(installation.events));
  }

  beforeEach(async () => {
    usageReads.length = 0;
    lifetime = new AbortController();
    rehearsal = await createRehearsal({
      projectSettings: { [FIRST_PROJECT]: { tools: [{ name: PORTAL, description: 'Reads the customer portal', check: ['/bin/sh', '-c', 'false'], fix: 'portal login', login: WAITING_LOGIN }] } },
    });
    installation = await openInstallation(rehearsal.config, rehearsal.environment, {
      harnessFor: () => new RehearsalAgents(),
      resources: NORMAL_RESOURCES,
      usage,
      log: SILENT_LOG,
      userHome: rehearsal.root,
    });
  });

  afterEach(async () => {
    const waiting = await loginProcess();
    if (waiting !== null) killProcessTree(waiting);
    installation.close();
    await rehearsal.cleanup();
  });

  it('stops the usage read of a refresh', async () => {
    const refreshed = send('usage.refresh', {});
    await waitFor(async () => (usageReads.length > 0 ? true : null), TIMEOUT_MS, 'the usage read to start');
    expect(usageReads.some((read) => read.aborted)).toBe(false);

    lifetime.abort();

    expect(await refreshed).toMatchObject({ status: 200 });
    expect(usageReads.every((read) => read.aborted)).toBe(true);
  });

  it('stops the login of a tool, and the process it started', async () => {
    const loggedIn = send('tools.login', { project: FIRST_PROJECT, tool: PORTAL });
    const waiting = await waitFor(loginProcess, TIMEOUT_MS, 'the login to start');
    expect(isAlive(waiting)).toBe(true);

    lifetime.abort();

    expect(await loggedIn).toMatchObject({ status: 409, body: { command: 'tools.login' } });
    await waitFor(async () => (isAlive(waiting) ? null : true), TIMEOUT_MS, 'the login process to end');
  });
});
