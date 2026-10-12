import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const LOOPBACK = '127.0.0.1';
const OK_STATUS = 200;
const UNAVAILABLE_STATUS = 503;
const NOT_FOUND_STATUS = 404;
const JSON_TYPE = 'application/json';

/** One environment of a demonstration project and the answer its health endpoint gives. */
export interface DemoEnvironmentHealth {
  readonly path: string;
  readonly healthy: boolean;
  readonly detail: string;
}

export interface DemoHealthEndpoints {
  url(path: string): string;
  close(): Promise<void>;
}

function listen(server: Server, port: number): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK, () => {
      server.off('error', reject);
      resolve(server.address() as AddressInfo);
    });
  });
}

/** Serves the health endpoints of the demonstration's environments on the loopback interface, on the port asked for or any free one. */
export async function startDemoHealthEndpoints(environments: readonly DemoEnvironmentHealth[], preferredPort: number): Promise<DemoHealthEndpoints> {
  const byPath = new Map(environments.map((environment) => [environment.path, environment]));
  const server = createServer((request, response) => {
    const environment = byPath.get(new URL(request.url ?? '/', `http://${LOOPBACK}`).pathname);
    const status = environment === undefined ? NOT_FOUND_STATUS : environment.healthy ? OK_STATUS : UNAVAILABLE_STATUS;
    response.writeHead(status, { 'content-type': JSON_TYPE });
    response.end(JSON.stringify({ status: environment?.healthy === true ? 'ok' : 'unavailable', detail: environment?.detail ?? 'unknown endpoint' }));
  });
  const address = await listen(server, preferredPort).catch(() => listen(server, 0));
  return {
    url: (path) => `http://${LOOPBACK}:${address.port}${path}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
