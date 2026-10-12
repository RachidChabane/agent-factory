import { createServer } from 'node:net';

const LOOPBACK_ADDRESS = '127.0.0.1';
const ANY_PORT = 0;

/** A TCP port of the loopback interface that nothing listens on right now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(ANY_PORT, LOOPBACK_ADDRESS, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('the system gave no TCP port')));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}
