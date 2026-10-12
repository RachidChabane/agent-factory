import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Sleeper } from '@agent-factory/application';
import { parseAgentFactoryConfig } from '../../config/agent-factory-config.ts';
import { FixtureFactory, jsonAnswer } from '../../watch/testing/fixture-factory.ts';
import { issueView, storefrontWith } from '../../watch/testing/watched-snapshots.ts';
import type { CliContext } from '../cli-context.ts';
import { runCli } from '../factory-cli.ts';
import { capturedOutput, cliContext, configText, type CapturedOutput } from '../testing/cli-harness.ts';
import { systemWatchPorts, watchCommand } from './watch-command.ts';

const ESCALATED = issueView(12, { state: 'needs-human', escalation: { reason: 'the gate failed', diagnosis: 'the gate failed', since: '2026-10-12T13:30:00.000Z' } });
const BLOCKED_LINE = '2026-10-12T14:00:00Z blocked needs-human storefront#12: the gate failed';

describe('agent-factory watch', () => {
  let home: string;
  let factory: FixtureFactory;
  let port: number;
  let captured: CapturedOutput;

  beforeEach(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), 'factory-watch-')));
    captured = capturedOutput();
    factory = new FixtureFactory();
    port = await factory.start();
  });
  afterEach(async () => {
    await factory.stop();
    await rm(home, { recursive: true, force: true });
  });

  function context(text = configText()): CliContext {
    return cliContext(home, captured, () => Promise.resolve(parseAgentFactoryConfig(text, home, `${home}/config.yaml`, home)));
  }

  it('prints the blockers present now and exits 1', async () => {
    factory.answer = jsonAnswer(storefrontWith([ESCALATED]));
    expect(await runCli(['watch', '--once', '--port', String(port)], context())).toBe(1);
    expect(captured.lines).toEqual([BLOCKED_LINE]);
  });

  it('prints one JSON object per line with --json', async () => {
    factory.answer = jsonAnswer(storefrontWith([ESCALATED]));
    expect(await runCli(['watch', '--once', '--json', '--port', String(port)], context())).toBe(1);
    expect(captured.lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      {
        at: '2026-10-12T14:00:00.000Z',
        transition: 'blocked',
        kind: 'needs-human',
        project: 'storefront',
        issue: 12,
        key: 'needs-human|storefront|12|2026-10-12T13:30:00.000Z',
        detail: 'the gate failed',
      },
    ]);
  });

  it('prints nothing and exits 0 when nothing blocks work', async () => {
    factory.answer = jsonAnswer(storefrontWith([issueView(12)]));
    expect(await runCli(['watch', '--once', '--port', String(port)], context())).toBe(0);
    expect(captured.lines).toEqual([]);
  });

  it('reads the factory at the host and port of the configuration', async () => {
    factory.answer = jsonAnswer(storefrontWith([ESCALATED]));
    const text = `${configText().replace('version: 1\n', `version: 1\nserver: { host: 127.0.0.1, port: ${port} }\n`)}`;
    expect(await runCli(['watch', '--once'], context(text))).toBe(1);
    expect(captured.lines).toEqual([BLOCKED_LINE]);
  });

  it('reports a factory that does not answer as a blocker', async () => {
    await factory.stop();
    expect(await runCli(['watch', '--once', '--port', String(port)], context())).toBe(1);
    expect(captured.lines).toEqual([expect.stringMatching(new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z blocked cockpit-unreachable factory: http://127.0.0.1:${port} is not reachable: ECONNREFUSED$`))]);
    factory = new FixtureFactory();
    await factory.start();
  });

  it('cannot find a factory that picks its port at each start, and says how to name it', async () => {
    const text = configText().replace('version: 1\n', 'version: 1\nserver: { host: 127.0.0.1, port: 0 }\n');
    expect(await runCli(['watch', '--once'], context(text))).toBe(1);
    expect(captured.errors).toEqual([expect.stringContaining('give the port with --port')]);
    expect(captured.lines).toEqual([]);
  });

  it('keeps reading at the interval, reports each change, and ends with the shutdown signal', async () => {
    const answers = [jsonAnswer(storefrontWith([ESCALATED])), jsonAnswer(storefrontWith([ESCALATED])), jsonAnswer(storefrontWith([]))];
    const intervals: number[] = [];
    const sleeper: Sleeper = {
      sleep: (milliseconds) => {
        intervals.push(milliseconds);
        const next = answers.shift();
        if (next === undefined) process.emit('SIGINT', 'SIGINT');
        else factory.answer = next;
        return Promise.resolve();
      },
    };
    factory.answer = answers.shift() ?? factory.answer;
    const command = { kind: 'watch', intervalSeconds: 7, once: false, json: false, port } as const;
    expect(await watchCommand(command, context(), { ...systemWatchPorts(), sleeper })).toBe(0);
    expect(captured.lines).toEqual([BLOCKED_LINE, '2026-10-12T14:00:00Z cleared needs-human storefront#12']);
    expect(intervals).toEqual([7_000, 7_000, 7_000]);
    expect(captured.errors).toEqual(['SIGINT received; stopping']);
  });
});
