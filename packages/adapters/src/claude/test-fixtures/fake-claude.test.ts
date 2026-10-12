import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { isAlive, killIfAlive, waitUntilGone } from '../../process/testSupport.ts';
import { FAKE_CLAUDE_SCRIPT, FAKE_LOGGED_IN_STATUS, FAKE_MODE_FLAG, FAKE_MODES } from './fake-claude-protocol.ts';

const execFileAsync = promisify(execFile);
const ANSWER_DEADLINE_MS = 20_000;

/** A process that starts the fake as a detached child, as a command runner does, and reports its id once the fake has answered. */
const HOST_SCRIPT = `
const { spawn } = require('node:child_process');
const [script, flag, mode] = process.argv.slice(1);
const fake = spawn(process.execPath, [script, flag, mode], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
fake.stdout.once('data', () => console.log(fake.pid));
setInterval(() => undefined, 1000);
`;

function firstLine(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    let text = '';
    stream.on('data', (chunk: Buffer) => {
      text += chunk.toString();
      if (text.includes('\n')) resolve(text.split('\n')[0] ?? '');
    });
  });
}

describe('a fake claude that waits for ever', () => {
  const started: number[] = [];

  afterEach(() => {
    for (const pid of started.splice(0)) killIfAlive(pid);
  });

  it('ends once the process that started it is gone, however that process died', async () => {
    const host = spawn(process.execPath, ['-e', HOST_SCRIPT, FAKE_CLAUDE_SCRIPT, FAKE_MODE_FLAG, 'hang'], { stdio: ['ignore', 'pipe', 'inherit'] });
    if (host.pid !== undefined) started.push(host.pid);
    const fakePid = Number.parseInt(await firstLine(host.stdout), 10);
    started.push(fakePid);
    expect(isAlive(fakePid)).toBe(true);
    host.kill('SIGKILL');
    expect(await waitUntilGone(fakePid)).toBe(true);
  });
});

describe('a fake claude asked for what the real CLI answers locally', () => {
  async function ask(mode: string, ...question: readonly string[]): Promise<string> {
    const { stdout } = await execFileAsync(process.execPath, [FAKE_CLAUDE_SCRIPT, FAKE_MODE_FLAG, mode, ...question], { timeout: ANSWER_DEADLINE_MS });
    return stdout;
  }

  it.each(FAKE_MODES)('names its login and ends, in %s mode', async (mode) => {
    expect(JSON.parse(await ask(mode, 'auth', 'status'))).toEqual(FAKE_LOGGED_IN_STATUS);
  });

  it.each(FAKE_MODES)('reports its usage and ends, in %s mode', async (mode) => {
    const lines = (await ask(mode, '-p', '/usage', '--output-format', 'stream-json')).trim().split('\n');
    expect(lines.map((line) => JSON.parse(line) as { usage_report?: unknown }).some((line) => line.usage_report !== undefined)).toBe(true);
  });
});
