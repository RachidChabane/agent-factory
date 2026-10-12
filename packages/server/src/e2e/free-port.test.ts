import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { freePort } from './free-port.ts';

const MAX_PORT = 65_535;

describe('freePort', () => {
  it('names a port of the loopback interface that can be listened on at once', async () => {
    const port = await freePort();
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(MAX_PORT);
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
