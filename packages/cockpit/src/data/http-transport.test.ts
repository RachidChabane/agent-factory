import { describe, expect, it, vi } from 'vitest';
import type { EventSourceLike } from './http-transport.ts';
import { HttpTransport, pageCommandToken } from './http-transport.ts';
import { TransportError } from './transport.ts';

class FakeEventSource implements EventSourceLike {
  readonly url: string;
  readonly listeners = new Map<string, (event: MessageEvent<unknown>) => void>();
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  dispatch(type: string, data: string): void {
    this.listeners.get(type)?.(new MessageEvent(type, { data }));
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('HttpTransport', () => {
  it('routes server-sent event channels to their handlers and asks for events after the sequence', () => {
    const sources: FakeEventSource[] = [];
    const transport = new HttpTransport(vi.fn(), (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    });
    const handlers = { onOpen: vi.fn(), onFactoryEvent: vi.fn(), onRunLog: vi.fn(), onTelemetry: vi.fn(), onDisconnect: vi.fn() };
    transport.openStream(1842, handlers);
    const source = sources[0];
    expect(source?.url).toBe('/api/events?after=1842');
    source?.onopen?.(new Event('open'));
    source?.dispatch('factory', '{"a":1}');
    source?.dispatch('run-log', '{"b":2}');
    source?.dispatch('telemetry', '{"c":3}');
    expect(handlers.onOpen).toHaveBeenCalledOnce();
    expect(handlers.onFactoryEvent).toHaveBeenCalledWith('{"a":1}');
    expect(handlers.onRunLog).toHaveBeenCalledWith('{"b":2}');
    expect(handlers.onTelemetry).toHaveBeenCalledWith('{"c":3}');
  });

  it('closes the native source on error so the controller owns reconnection', () => {
    let source: FakeEventSource | null = null;
    const transport = new HttpTransport(vi.fn(), (url) => {
      source = new FakeEventSource(url);
      return source;
    });
    const handlers = { onOpen: vi.fn(), onFactoryEvent: vi.fn(), onRunLog: vi.fn(), onTelemetry: vi.fn(), onDisconnect: vi.fn() };
    transport.openStream(0, handlers);
    const opened: FakeEventSource | null = source;
    expect(opened).not.toBeNull();
    if (opened === null) return;
    const current: FakeEventSource = opened;
    current.onerror?.(new Event('error'));
    current.onerror?.(new Event('error'));
    expect(current.closed).toBe(true);
    expect(handlers.onDisconnect).toHaveBeenCalledOnce();
  });

  it('posts commands as JSON and surfaces the server error message', async () => {
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/api/commands/pr.merge' && init?.method === 'POST') return jsonResponse(409, { error: 'head moved' });
      return jsonResponse(200, { sequence: 7 });
    });
    const transport = new HttpTransport(fetchFn, (url) => new FakeEventSource(url));
    await expect(transport.sendCommand('issue.start', { issueNumber: 1 })).resolves.toEqual({ sequence: 7 });
    expect(fetchFn).toHaveBeenCalledWith('/api/commands/issue.start', expect.objectContaining({ method: 'POST', body: '{"issueNumber":1}' }));
    await expect(transport.sendCommand('pr.merge', {})).rejects.toEqual(new TransportError('head moved', 409));
  });

  it('requests run log pages after a line index', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { runId: 'r', total: 0, lines: [] }));
    const transport = new HttpTransport(fetchFn, (url) => new FakeEventSource(url));
    await transport.loadRunLog('run 1', 41);
    await transport.loadRunLog('r', null);
    expect(fetchFn.mock.calls.map((call) => call.at(0))).toEqual(['/api/runs/run%201/log?after=41', '/api/runs/r/log']);
  });
});

describe('command token', () => {
  it('sends the token the page carries with every command', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { sequence: 1 }));
    await new HttpTransport(fetchFn, vi.fn(), 'abc123').sendCommand('scheduler.pause', {});
    expect(fetchFn).toHaveBeenCalledWith('/api/commands/scheduler.pause', expect.objectContaining({ headers: expect.objectContaining({ 'x-factory-command-token': 'abc123' }) }));
  });

  it('sends no token header when the page carries none', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { sequence: 1 }));
    await new HttpTransport(fetchFn, vi.fn()).sendCommand('scheduler.pause', {});
    expect(fetchFn.mock.calls[0]?.[1]?.headers).not.toHaveProperty('x-factory-command-token');
  });

  it('reads the token from the meta tag of the page', () => {
    document.head.innerHTML = '<meta name="factory-command-token" content="tok-1">';
    expect(pageCommandToken(document)).toBe('tok-1');
    document.head.innerHTML = '';
    expect(pageCommandToken(document)).toBeNull();
  });
});
