import { createServer, type Server } from 'node:http';
import { API_STATE_PATH } from '@agent-factory/cockpit';

const HTTP_OK = 200;
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

/** What the fixture factory answers at `GET /api/state`. */
export interface FixtureAnswer {
  readonly status: number;
  readonly body: string;
}

export function jsonAnswer(snapshot: unknown): FixtureAnswer {
  return { status: HTTP_OK, body: JSON.stringify(snapshot) };
}

/** A real HTTP server that serves one answer at the state path of the cockpit's API, the answer a test sets. */
export class FixtureFactory {
  answer: FixtureAnswer = { status: HTTP_OK, body: '{}' };
  /** When set, the server accepts the request and never answers it. */
  silent = false;
  private readonly server: Server;

  constructor() {
    this.server = createServer((request, response) => {
      if (this.silent) return;
      if (request.url !== API_STATE_PATH) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(this.answer.status, { 'content-type': JSON_CONTENT_TYPE }).end(this.answer.body);
    });
  }

  async start(port = 0): Promise<number> {
    await new Promise<void>((resolve) => this.server.listen(port, '127.0.0.1', resolve));
    return this.port();
  }

  port(): number {
    const address = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('the fixture factory is not listening');
    return address.port;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
