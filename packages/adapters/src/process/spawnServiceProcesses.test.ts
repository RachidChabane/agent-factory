import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processStartTime, SpawnServiceProcesses } from './spawnServiceProcesses.ts';

const GRACE_MS = 2_000;
const SERVER = `
const server = require('node:http').createServer((request, response) => response.end('up'));
server.listen(Number(process.env.PORT), '127.0.0.1', () => console.log('listening on ' + process.env.PORT));
process.on('SIGTERM', () => { console.log('stopping'); server.close(() => process.exit(0)); });
`;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function answers(port: number): Promise<boolean> {
  try {
    return (await (await fetch(`http://127.0.0.1:${port}/`)).text()) === 'up';
  } catch {
    return false;
  }
}

async function eventually(probe: () => Promise<boolean>, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

describe('the processes of a stack', () => {
  let root: string;
  let services: SpawnServiceProcesses;
  const environment = { PATH: process.env['PATH'] ?? '' };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'factory-services-'));
    await writeFile(join(root, 'server.js'), SERVER);
    services = new SpawnServiceProcesses(join(root, 'logs'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('runs a service in its own group, keeps what it prints, and stops the whole group', async () => {
    const port = await freePort();
    const service = await services.start('web', ['/bin/sh', '-c', `node server.js & wait`], root, { ...environment, PORT: String(port) });
    expect(await eventually(() => answers(port))).toBe(true);
    expect(service.startedAt).toBe(await processStartTime(service.pid));
    expect(await service.running()).toBe(true);
    await service.stop(GRACE_MS);
    expect(await eventually(async () => !(await answers(port)))).toBe(true);
    expect(await eventually(async () => !(await service.running()))).toBe(true);
    expect(await service.output()).toContain(`listening on ${port}`);
  });

  it('stops a service a factory that ended left running, only when it is still that same process', async () => {
    const port = await freePort();
    const service = await services.start('api', [process.execPath, 'server.js'], root, { ...environment, PORT: String(port) });
    expect(await eventually(() => answers(port))).toBe(true);
    expect(await services.reclaim(service.pid, 'Thu Jan  1 00:00:00 1970', GRACE_MS)).toBe(false);
    expect(await answers(port)).toBe(true);
    expect(await services.reclaim(service.pid, service.startedAt ?? '', GRACE_MS)).toBe(true);
    expect(await eventually(async () => !(await answers(port)))).toBe(true);
    expect(await services.reclaim(service.pid, service.startedAt ?? '', GRACE_MS)).toBe(false);
  });

  it('refuses to start a command that does not exist', async () => {
    await expect(services.start('missing', ['/no/such/command'], root, environment)).rejects.toThrow();
  });
});
