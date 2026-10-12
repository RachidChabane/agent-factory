import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpawnCommandRunner } from '@agent-factory/adapters';
import { ToolLoginUnavailableError } from '@agent-factory/application';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ToolCheckConfig } from '../../config/agent-factory-config.ts';
import { ConfiguredToolSessions, ToolKeepAliveUnavailableError } from './tool-sessions.ts';

const SECRET_LOOKING_OUTPUT = 'token hvs.CAESIJ-example-not-a-real-token';

function tool(name: string, login: string | null, keepAlive: string | null, timeoutMs = 10_000): ToolCheckConfig {
  return {
    name,
    description: null,
    check: ['true'],
    version: null,
    connectedPattern: null,
    fix: null,
    install: null,
    timeoutMs,
    login: login === null ? null : { command: login, timeoutMs },
    keepAlive: keepAlive === null ? null : { command: keepAlive, everyMs: 60_000, timeoutMs },
  };
}

describe('the declared sessions of the tools', () => {
  let home: string;
  let sessions: ConfiguredToolSessions;
  const signal = new AbortController().signal;

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), 'factory-tool-sessions-'));
    sessions = new ConfiguredToolSessions(
      [
        tool('vault', `echo '${SECRET_LOOKING_OUTPUT}'; pwd > where; echo "$MARKER" > marker`, 'exit 3'),
        tool('slow', 'sleep 5', null, 300),
        tool('plain', null, null),
      ],
      new SpawnCommandRunner(),
      { environment: { PATH: process.env['PATH'], MARKER: 'from the operator environment' }, home },
    );
  });

  afterAll(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("runs a login in the operator's home with their environment, and keeps only how it ended", async () => {
    const run = await sessions.run('vault', 'login', signal);
    expect(run).toEqual({ outcome: 'succeeded', detail: expect.stringMatching(/^exit code 0 after \d+ s$/) });
    expect(JSON.stringify(run)).not.toContain('hvs.');
    expect((await readFile(join(home, 'marker'), 'utf8')).trim()).toBe('from the operator environment');
    expect((await readFile(join(home, 'where'), 'utf8')).trim()).toContain('factory-tool-sessions-');
  });

  it('says a keep-alive failed with its exit code, and a login that outlives its bound timed out', async () => {
    expect(await sessions.run('vault', 'keep-alive', signal)).toEqual({ outcome: 'failed', detail: expect.stringMatching(/^exit code 3 after \d+ s$/) });
    expect(await sessions.run('slow', 'login', signal)).toEqual({ outcome: 'timed-out', detail: 'timed out after 0 s' });
  });

  it('refuses a login or a keep-alive the tool does not declare', async () => {
    await expect(sessions.run('plain', 'login', signal)).rejects.toBeInstanceOf(ToolLoginUnavailableError);
    await expect(sessions.run('plain', 'keep-alive', signal)).rejects.toBeInstanceOf(ToolKeepAliveUnavailableError);
    await expect(sessions.run('absent', 'login', signal)).rejects.toBeInstanceOf(ToolLoginUnavailableError);
  });

  it('lists the sessions the daemon keeps alive', () => {
    expect(sessions.keptSessions()).toEqual([{ tool: 'vault', everyMs: 60_000 }]);
  });
});
