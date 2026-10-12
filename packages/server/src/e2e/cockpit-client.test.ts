import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { CockpitClient } from './cockpit-client.ts';
import { freePort } from './free-port.ts';

const REQUEST_TIMEOUT_MS = 2_000;
let server: Server | null = null;

async function serving(status: number): Promise<{ port: number; paths: string[] }> {
  const paths: string[] = [];
  const listening = createServer((request, response) => {
    paths.push(request.url ?? '');
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end('{"projects":[]}');
  });
  await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve));
  server = listening;
  const address = listening.address();
  if (address === null || typeof address === 'string') throw new Error('the test server has no TCP address');
  return { port: address.port, paths };
}

afterEach(async () => {
  const closing = server;
  server = null;
  if (closing !== null) await new Promise<void>((resolve) => closing.close(() => resolve()));
});

describe('CockpitClient', () => {
  it('asks the cockpit for its state and reports how it answered', async () => {
    const { port, paths } = await serving(200);
    const answer = await new CockpitClient(port, REQUEST_TIMEOUT_MS).requestState();
    expect(answer).toEqual({ status: 200, detail: 'GET /api/state answered 200' });
    expect(paths).toEqual(['/api/state']);
  });

  it('reports an answer that is an error as an answer', async () => {
    const { port } = await serving(500);
    expect((await new CockpitClient(port, REQUEST_TIMEOUT_MS).requestState()).status).toBe(500);
  });

  it('reports no answer, with the reason, when nothing listens', async () => {
    const answer = await new CockpitClient(await freePort(), REQUEST_TIMEOUT_MS).requestState();
    expect(answer.status).toBeNull();
    expect(answer.detail).toContain('GET /api/state got no answer');
  });
});
