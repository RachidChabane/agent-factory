import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import {
  AFTER_QUERY_PARAMETER,
  API_COMMANDS_PATH,
  API_EVENTS_PATH,
  API_PROJECTS_PATH,
  API_RUNS_PATH,
  EVIDENCE_SEGMENT,
  FORGE_SEGMENT,
  REQUESTS_SEGMENT,
  COMMAND_TOKEN_HEADER,
  COMMAND_TOKEN_META_NAME,
  API_STATE_PATH,
  type CockpitSnapshot,
  type TelemetrySample,
} from '@agent-factory/cockpit';
import { EVIDENCE_CACHE_ISSUE_PREFIX, type EventStore, type OperationLog, type RunLogStore } from '@agent-factory/application';
import type { RemoteAccessConfig } from '../config/agent-factory-config.ts';
import { EventStreamConnection, runLogJson, type EventStreamSettings } from './event-stream.ts';
import { identify } from './identity.ts';
import { CommandToken } from './command-token.ts';
import { isFile, resolveInside, sendFile } from './static-files.ts';

export const INDEX_FILE = 'index.html';
export const MAX_COMMAND_BODY_BYTES = 32 * 1024 * 1024;
export const DEFAULT_STREAM_SETTINGS: EventStreamSettings = { heartbeatMs: 15_000, pollMs: 1_000, telemetryMs: 10_000 };
const LAST_EVENT_ID_HEADER = 'last-event-id';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const HEAD_CLOSE = '</head>';
const HTTP = { ok: 200, badRequest: 400, forbidden: 403, notFound: 404, methodNotAllowed: 405, tooLarge: 413, error: 500 } as const;
const GET = 'GET';
const POST = 'POST';
const HEAD = 'HEAD';
const API_PREFIX = '/api/';
const PATH_SEPARATOR = '/';
const NO_SEQUENCE = 0;
const COCKPIT_NOT_BUILT = 'the cockpit is not built; run "pnpm --filter @agent-factory/cockpit build"';
const INTEGER = /^\d+$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
export interface CommandOutcome {
  readonly status: number;
  readonly body: unknown;
}

export interface HttpServerDependencies {
  readonly events: EventStore;
  readonly runLogs: RunLogStore;
  readonly log: OperationLog;
  snapshot(): Promise<CockpitSnapshot>;
  telemetry(): Promise<TelemetrySample>;
  command(name: string, body: unknown, operator: string): Promise<CommandOutcome>;
}

/** Where a project keeps the files the cockpit links to. */
export interface ProjectFileDirectories {
  readonly evidence: string;
  readonly requests: string;
  /** The directory of a local forge; null for a remote forge. */
  readonly forge: string | null;
}

export interface HttpServerSettings {
  readonly host: string;
  readonly port: number;
  /** Who acts for a request that carries no identity, such as one from the operator's own machine. */
  readonly operator: string;
  readonly remoteAccess: RemoteAccessConfig;
  readonly projectDirectories: (project: string) => ProjectFileDirectories | null;
  readonly cockpitDirectory: string;
  readonly stream: EventStreamSettings;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': JSON_CONTENT_TYPE, 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_COMMAND_BODY_BYTES) {
        reject(new RangeError(`the command body exceeds ${MAX_COMMAND_BODY_BYTES} bytes`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function afterValue(url: URL, request: IncomingMessage): number | null {
  const header = request.headers[LAST_EVENT_ID_HEADER];
  const raw = url.searchParams.get(AFTER_QUERY_PARAMETER) ?? (Array.isArray(header) ? header[0] : header) ?? null;
  if (raw === null) return null;
  return INTEGER.test(raw) ? Number(raw) : Number.NaN;
}

export class FactoryHttpServer {
  private readonly dependencies: HttpServerDependencies;
  private readonly settings: HttpServerSettings;
  private readonly connections = new Set<EventStreamConnection>();
  private readonly commandToken = CommandToken.generate();
  private server: Server | null = null;

  constructor(dependencies: HttpServerDependencies, settings: HttpServerSettings) {
    this.dependencies = dependencies;
    this.settings = settings;
  }

  async start(): Promise<AddressInfo> {
    const server = createServer((request, response) => {
      void this.handle(request, response).catch((error: unknown) => {
        this.dependencies.log.warn(`${request.method ?? ''} ${request.url ?? ''} failed: ${errorText(error)}`);
        if (!response.headersSent) sendJson(response, HTTP.error, { error: errorText(error) });
        else response.end();
      });
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.settings.port, this.settings.host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('the server has no TCP address');
    return address;
  }

  async stop(): Promise<void> {
    for (const connection of [...this.connections]) connection.close();
    const server = this.server;
    this.server = null;
    if (server === null) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const decision = identify(request.headers, request.socket.remoteAddress, this.settings.remoteAccess);
    if (!decision.allowed) {
      sendJson(response, HTTP.forbidden, { error: decision.reason });
      return;
    }
    const url = new URL(request.url ?? PATH_SEPARATOR, 'http://localhost');
    const method = request.method ?? GET;
    const path = url.pathname;
    if (method === POST && path.startsWith(`${API_COMMANDS_PATH}${PATH_SEPARATOR}`)) {
      if (!this.commandToken.matches(request.headers[COMMAND_TOKEN_HEADER])) {
        sendJson(response, HTTP.forbidden, { error: `the ${COMMAND_TOKEN_HEADER} header is missing or wrong` });
        return;
      }
      await this.command(request, response, decodeURIComponent(path.slice(API_COMMANDS_PATH.length + 1)), decision.operator ?? this.settings.operator);
      return;
    }
    if (method !== GET && method !== HEAD) {
      sendJson(response, HTTP.methodNotAllowed, { error: `${method} is not allowed on ${path}` });
      return;
    }
    if (path === API_STATE_PATH) {
      sendJson(response, HTTP.ok, await this.dependencies.snapshot());
      return;
    }
    if (path === API_EVENTS_PATH) {
      this.stream(request, response, url);
      return;
    }
    if (path.startsWith(`${API_RUNS_PATH}${PATH_SEPARATOR}`)) {
      await this.runLog(response, url, path);
      return;
    }
    if (path.startsWith(`${API_PROJECTS_PATH}${PATH_SEPARATOR}`)) {
      await this.projectFile(response, path);
      return;
    }
    if (path.startsWith(API_PREFIX)) {
      sendJson(response, HTTP.notFound, { error: `no route for ${path}` });
      return;
    }
    await this.cockpit(response, path);
  }

  private async command(request: IncomingMessage, response: ServerResponse, name: string, operator: string): Promise<void> {
    let body: unknown;
    try {
      const text = await readBody(request);
      body = text.trim() === '' ? {} : JSON.parse(text);
    } catch (error) {
      sendJson(response, error instanceof RangeError ? HTTP.tooLarge : HTTP.badRequest, { error: errorText(error), command: name });
      return;
    }
    const outcome = await this.dependencies.command(name, body, operator);
    sendJson(response, outcome.status, outcome.body);
  }

  private stream(request: IncomingMessage, response: ServerResponse, url: URL): void {
    const after = afterValue(url, request);
    if (after !== null && Number.isNaN(after)) {
      sendJson(response, HTTP.badRequest, { error: `${AFTER_QUERY_PARAMETER} must be a sequence number` });
      return;
    }
    const connection = new EventStreamConnection(
      response,
      { events: this.dependencies.events, runLogs: this.dependencies.runLogs, telemetry: () => this.dependencies.telemetry() },
      this.settings.stream,
      after ?? NO_SEQUENCE,
    );
    this.connections.add(connection);
    response.on('close', () => this.connections.delete(connection));
    connection.start();
  }

  private async runLog(response: ServerResponse, url: URL, path: string): Promise<void> {
    const [runId, tail, ...extra] = path.slice(API_RUNS_PATH.length + 1).split(PATH_SEPARATOR);
    if (runId === undefined || tail !== 'log' || extra.length > 0) {
      sendJson(response, HTTP.notFound, { error: `no route for ${path}` });
      return;
    }
    const raw = url.searchParams.get(AFTER_QUERY_PARAMETER);
    if (raw !== null && !INTEGER.test(raw)) {
      sendJson(response, HTTP.badRequest, { error: `${AFTER_QUERY_PARAMETER} must be a line index` });
      return;
    }
    try {
      const page = await this.dependencies.runLogs.read(decodeURIComponent(runId), raw === null ? null : Number(raw));
      response.writeHead(HTTP.ok, { 'content-type': JSON_CONTENT_TYPE, 'cache-control': 'no-store' });
      response.end(`{"runId":${JSON.stringify(page.runId)},"total":${page.total},"lines":[${page.lines.map(runLogJson).join(',')}]}`);
    } catch (error) {
      sendJson(response, HTTP.badRequest, { error: errorText(error) });
    }
  }

  /** Serves `/api/projects/<project>/evidence/<issue>/<path>` and `/api/projects/<project>/requests/<request>/<path>`. */
  private async projectFile(response: ServerResponse, path: string): Promise<void> {
    const [project, segment, owner, ...rest] = path.slice(API_PROJECTS_PATH.length + 1).split(PATH_SEPARATOR).map(decodeURIComponent);
    const directories = project === undefined ? null : this.settings.projectDirectories(project);
    if (directories === null || owner === undefined) {
      sendJson(response, HTTP.notFound, { error: `no file at ${path}` });
      return;
    }
    if (segment === FORGE_SEGMENT && directories.forge !== null) {
      await this.sendInside(response, directories.forge, [owner, ...rest].join(PATH_SEPARATOR), path);
      return;
    }
    if (rest.length === 0) {
      sendJson(response, HTTP.notFound, { error: `no file at ${path}` });
      return;
    }
    if (segment === EVIDENCE_SEGMENT && POSITIVE_INTEGER.test(owner)) {
      await this.sendInside(response, join(directories.evidence, `${EVIDENCE_CACHE_ISSUE_PREFIX}${owner}`), rest.join(PATH_SEPARATOR), path);
      return;
    }
    const requestRoot = segment === REQUESTS_SEGMENT ? resolveInside(directories.requests, owner) : null;
    if (requestRoot === null) {
      sendJson(response, HTTP.notFound, { error: `no file at ${path}` });
      return;
    }
    await this.sendInside(response, requestRoot, rest.join(PATH_SEPARATOR), path);
  }

  private async sendInside(response: ServerResponse, root: string, relativePath: string, path: string): Promise<void> {
    const file = resolveInside(root, relativePath);
    if (file === null || !(await isFile(file))) {
      sendJson(response, HTTP.notFound, { error: `no file at ${path}` });
      return;
    }
    sendFile(response, file);
  }

  private async cockpit(response: ServerResponse, path: string): Promise<void> {
    const index = join(this.settings.cockpitDirectory, INDEX_FILE);
    if (!(await isFile(index))) {
      sendJson(response, HTTP.notFound, { error: COCKPIT_NOT_BUILT });
      return;
    }
    const asset = path === PATH_SEPARATOR ? null : resolveInside(this.settings.cockpitDirectory, path.slice(1));
    if (asset !== null && (await isFile(asset)) && asset !== index) {
      sendFile(response, asset);
      return;
    }
    const page = await readFile(index, 'utf8');
    response.writeHead(HTTP.ok, { 'content-type': HTML_CONTENT_TYPE, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    response.end(this.withCommandToken(page));
  }

  private withCommandToken(page: string): string {
    const meta = `<meta name="${COMMAND_TOKEN_META_NAME}" content="${this.commandToken.value}">`;
    return page.includes(HEAD_CLOSE) ? page.replace(HEAD_CLOSE, `${meta}${HEAD_CLOSE}`) : `${meta}${page}`;
  }
}
