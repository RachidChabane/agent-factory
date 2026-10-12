import { createServer, connect } from 'node:net';

const LOOPBACK = '127.0.0.1';
const FIRST_PORT = 20_000;
const PORT_SPAN = 20_000;
const CONNECT_TIMEOUT_MS = 1_000;

function canBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, LOOPBACK, () => server.close(() => resolve(true)));
  });
}

/** Whether something accepts connections on the loopback port. */
export function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: LOOPBACK, port });
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

/** A port and the one after it, both free: the factory serves the cockpit on the first and its demonstration health checks on the second. */
export async function freePortPair(): Promise<number> {
  for (let attempt = 0; attempt < PORT_SPAN; attempt += 1) {
    const port = FIRST_PORT + Math.floor(Math.random() * PORT_SPAN);
    if ((await canBind(port)) && (await canBind(port + 1))) return port;
  }
  throw new Error('no pair of adjacent free ports on the loopback interface');
}
