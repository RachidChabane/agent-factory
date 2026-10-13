import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactDomClient from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { COMMAND_TOKEN_META_NAME, eventsPath } from './contract/index.ts';
import { INITIAL_SEQUENCE } from './test/fixtures/world.ts';
import { fixtureSnapshot } from './test/render.tsx';

const mountedRoots = vi.hoisted((): { current: Root[] } => ({ current: [] }));

vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactDomClient>();
  return {
    ...actual,
    createRoot: (container: Element | DocumentFragment, options?: Parameters<typeof actual.createRoot>[1]) => {
      const root = actual.createRoot(container, options);
      mountedRoots.current.push(root);
      return root;
    },
  };
});

class RecordedEventSource {
  static readonly opened: RecordedEventSource[] = [];
  readonly url: string;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    RecordedEventSource.opened.push(this);
  }

  addEventListener(): void {}

  close(): void {
    this.closed = true;
  }
}

interface RecordedRequest {
  readonly path: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | null;
}

const COMMAND_TOKEN = 'a1b2c3';

function serveFactory(requests: RecordedRequest[]): void {
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    requests.push({ path: input, method: init?.method ?? 'GET', headers: { ...(init?.headers as Record<string, string> | undefined) }, body: typeof init?.body === 'string' ? init.body : null });
    if (input === '/api/state') return new Response(JSON.stringify(fixtureSnapshot()), { status: 200 });
    if (input.startsWith('/api/commands/')) return new Response(JSON.stringify({ sequence: 1843, effect: 'No new work starts for the whole installation' }), { status: 200 });
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  });
  vi.stubGlobal('EventSource', RecordedEventSource);
}

async function bootCockpit(): Promise<void> {
  document.body.innerHTML = '<div id="root"></div>';
  document.head.innerHTML = `<meta name="${COMMAND_TOKEN_META_NAME}" content="${COMMAND_TOKEN}">`;
  vi.resetModules();
  await import('./main.tsx');
}

beforeEach(() => {
  RecordedEventSource.opened.length = 0;
  window.history.pushState({}, '', '/');
  window.localStorage.clear();
});

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.current) root.unmount();
  });
  mountedRoots.current = [];
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('the cockpit as the browser boots it', () => {
  it('lands on the changes at the root address', async () => {
    serveFactory([]);
    await bootCockpit();
    expect(await screen.findByRole('heading', { level: 1, name: 'Changes' })).toBeInTheDocument();
  });

  it('loads the state of the factory, follows its events after the last one it holds and draws the board', async () => {
    const requests: RecordedRequest[] = [];
    serveFactory(requests);
    window.history.pushState({}, '', '/board');
    await bootCockpit();
    expect(await screen.findByRole('region', { name: 'Implementation' })).toBeInTheDocument();
    expect(requests.map((request) => request.path)).toContain('/api/state');
    expect(RecordedEventSource.opened.filter((source) => !source.closed).map((source) => source.url)).toEqual([eventsPath(INITIAL_SEQUENCE)]);
    expect(document.documentElement.lang).toBe('en');
  });

  it('sends a command with the token the page carries and shows what the factory answers', async () => {
    const requests: RecordedRequest[] = [];
    serveFactory(requests);
    await bootCockpit();
    const sidebar = await screen.findByRole('navigation', { name: 'Main navigation' });
    await userEvent.setup().click(within(sidebar).getByRole('button', { name: 'Pause the factory' }));
    await waitFor(() => expect(requests.some((request) => request.method === 'POST')).toBe(true));
    const sent = requests.find((request) => request.method === 'POST');
    expect(sent?.path).toBe('/api/commands/scheduler.pause');
    expect(sent?.body).toBe('{"project":null}');
    expect(sent?.headers['x-factory-command-token']).toBe(COMMAND_TOKEN);
    expect(await within(screen.getByRole('status')).findByText('No new work starts for the whole installation')).toBeInTheDocument();
  });

  it('starts in the language the operator chose before and writes it on the page', async () => {
    serveFactory([]);
    window.localStorage.setItem('cockpit.language', 'fr');
    window.history.pushState({}, '', '/board');
    await bootCockpit();
    expect(await screen.findByRole('region', { name: 'Implémentation' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
  });

  it('says that the state could not be loaded when the factory does not answer', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('connection refused');
    });
    vi.stubGlobal('EventSource', RecordedEventSource);
    await bootCockpit();
    expect(await screen.findByText(/connection refused/)).toBeInTheDocument();
  });
});
