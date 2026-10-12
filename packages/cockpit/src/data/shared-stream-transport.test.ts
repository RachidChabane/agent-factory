import { describe, expect, it, vi } from 'vitest';
import { FakeTransport } from '../test/fake-transport.ts';
import type { StreamHandlers } from './transport.ts';
import type { LockManagerLike, MessageChannelLike, SharedStreamEnvironment } from './shared-stream-transport.ts';
import { SharedStreamTransport } from './shared-stream-transport.ts';
import type { StreamMessage } from './shared-stream-protocol.ts';

const FIRST_SEQUENCE = 10;

class FakeLocks implements LockManagerLike {
  private held = false;
  private readonly waiting: { readonly grant: () => void; readonly cancel: () => void }[] = [];

  request(_name: string, options: { readonly signal: AbortSignal }, callback: () => Promise<void>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const grant = (): void => {
        this.held = true;
        void callback().finally(() => {
          this.held = false;
          this.waiting.shift()?.grant();
          resolve(undefined);
        });
      };
      if (!this.held) {
        grant();
        return;
      }
      const entry = {
        grant,
        cancel: () => {
          this.waiting.splice(this.waiting.indexOf(entry), 1);
          reject(new DOMException('aborted', 'AbortError'));
        },
      };
      this.waiting.push(entry);
      options.signal.addEventListener('abort', entry.cancel, { once: true });
    });
  }
}

class FakeChannel implements MessageChannelLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  closed = false;
  private readonly peers: Set<FakeChannel>;

  constructor(peers: Set<FakeChannel>) {
    this.peers = peers;
    peers.add(this);
  }

  postMessage(message: StreamMessage): void {
    for (const peer of this.peers) {
      if (peer !== this && !peer.closed) queueMicrotask(() => peer.onmessage?.({ data: structuredClone(message) }));
    }
  }

  close(): void {
    this.closed = true;
    this.peers.delete(this);
  }
}

class Browser {
  readonly locks = new FakeLocks();
  readonly channels = new Set<FakeChannel>();
  readonly environment: SharedStreamEnvironment = { locks: this.locks, createChannel: () => new FakeChannel(this.channels) };

  tab(): Tab {
    return new Tab(this.environment);
  }
}

class Tab {
  readonly inner = new FakeTransport(null);
  readonly transport: SharedStreamTransport;
  readonly opened = vi.fn();
  readonly disconnected = vi.fn();
  readonly factoryFrames: string[] = [];
  readonly runLogFrames: string[] = [];
  readonly telemetryFrames: string[] = [];
  readonly handlers: StreamHandlers = {
    onOpen: this.opened,
    onFactoryEvent: (data) => this.factoryFrames.push(data),
    onRunLog: (data) => this.runLogFrames.push(data),
    onTelemetry: (data) => this.telemetryFrames.push(data),
    onDisconnect: this.disconnected,
  };

  constructor(environment: SharedStreamEnvironment) {
    this.transport = new SharedStreamTransport(this.inner, environment);
  }

  open(after = FIRST_SEQUENCE) {
    return this.transport.openStream(after, this.handlers);
  }
}

function frame(sequence: number): string {
  return JSON.stringify({ sequence, type: 'issue.transitioned' });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SharedStreamTransport', () => {
  it('lets a lone tab open the stream and receive every kind of frame', async () => {
    const tab = new Browser().tab();
    tab.open();
    await settle();
    expect(tab.inner.openedAfter).toEqual([FIRST_SEQUENCE]);
    tab.inner.handlers?.onOpen();
    tab.inner.handlers?.onFactoryEvent(frame(11));
    tab.inner.handlers?.onRunLog('{"runId":"r"}');
    tab.inner.handlers?.onTelemetry('{"resources":{}}');
    expect(tab.opened).toHaveBeenCalledOnce();
    expect(tab.factoryFrames).toEqual([frame(11)]);
    expect(tab.runLogFrames).toEqual(['{"runId":"r"}']);
    expect(tab.telemetryFrames).toEqual(['{"resources":{}}']);
  });

  it('keeps one upstream stream for any number of tabs and relays its frames to all of them', async () => {
    const browser = new Browser();
    const tabs = [browser.tab(), browser.tab(), browser.tab()];
    for (const tab of tabs) tab.open();
    await settle();
    const leaders = tabs.filter((tab) => tab.inner.openedAfter.length > 0);
    expect(leaders).toHaveLength(1);
    leaders[0]?.inner.handlers?.onOpen();
    leaders[0]?.inner.handlers?.onFactoryEvent(frame(11));
    leaders[0]?.inner.handlers?.onTelemetry('{"resources":{}}');
    await settle();
    for (const tab of tabs) {
      expect(tab.opened).toHaveBeenCalledOnce();
      expect(tab.factoryFrames).toEqual([frame(11)]);
      expect(tab.telemetryFrames).toEqual(['{"resources":{}}']);
    }
  });

  it('tells a tab that joins late that the stream is already open', async () => {
    const browser = new Browser();
    const leader = browser.tab();
    leader.open();
    await settle();
    leader.inner.handlers?.onOpen();
    const late = browser.tab();
    late.open();
    await settle();
    expect(late.inner.openedAfter).toEqual([]);
    expect(late.opened).toHaveBeenCalledOnce();
  });

  it('hands the stream to a waiting tab when the leading tab goes away, resuming after the last frame it relayed', async () => {
    const browser = new Browser();
    const leader = browser.tab();
    const follower = browser.tab();
    const leading = leader.open();
    follower.open(FIRST_SEQUENCE);
    await settle();
    leader.inner.handlers?.onOpen();
    leader.inner.handlers?.onFactoryEvent(frame(11));
    leader.inner.handlers?.onFactoryEvent(frame(12));
    await settle();
    leading.close();
    await settle();
    expect(leader.inner.handlers).toBeNull();
    expect(follower.inner.openedAfter).toEqual([12]);
    follower.inner.handlers?.onOpen();
    follower.inner.handlers?.onFactoryEvent(frame(13));
    expect(follower.factoryFrames).toEqual([frame(11), frame(12), frame(13)]);
  });

  it('reports the loss of the upstream stream to every tab and frees the lock for the reconnection', async () => {
    const browser = new Browser();
    const leader = browser.tab();
    const follower = browser.tab();
    leader.open();
    follower.open();
    await settle();
    leader.inner.handlers?.onDisconnect();
    await settle();
    expect(leader.disconnected).toHaveBeenCalledOnce();
    expect(follower.disconnected).toHaveBeenCalledOnce();
    follower.open();
    await settle();
    expect(follower.inner.openedAfter).toEqual([FIRST_SEQUENCE]);
  });

  it('ignores messages that are not part of the protocol', async () => {
    const browser = new Browser();
    const follower = browser.tab();
    const leader = browser.tab();
    leader.open();
    follower.open();
    await settle();
    for (const peer of browser.channels) peer.onmessage?.({ data: { kind: 'frame', channel: 'nope', data: 3 } });
    expect(follower.factoryFrames).toEqual([]);
  });

  it('stops listening once closed', async () => {
    const browser = new Browser();
    const leader = browser.tab();
    const follower = browser.tab();
    leader.open();
    const waiting = follower.open();
    await settle();
    waiting.close();
    leader.inner.handlers?.onFactoryEvent(frame(11));
    await settle();
    expect(follower.factoryFrames).toEqual([]);
    expect(browser.channels.size).toBe(1);
  });

  it('loads, reads and sends through the plain transport', async () => {
    const tab = new Browser().tab();
    tab.inner.snapshot = { sequence: 3 };
    tab.inner.diffs.set('storefront/7', { files: [] });
    expect(await tab.transport.loadSnapshot()).toEqual({ sequence: 3 });
    expect(await tab.transport.loadRunLog('run-1', 4)).toMatchObject({ runId: 'run-1' });
    expect(tab.inner.runLogRequests).toEqual([{ runId: 'run-1', afterIndex: 4 }]);
    expect(await tab.transport.loadPullRequestDiff('storefront', 7)).toEqual({ files: [] });
    expect(tab.inner.diffRequests).toEqual([{ project: 'storefront', pullRequestNumber: 7 }]);
    await tab.transport.sendCommand('issue.start', { project: 'storefront', issueNumber: 7 });
    expect(tab.inner.commands).toEqual([{ name: 'issue.start', body: { project: 'storefront', issueNumber: 7 } }]);
  });
});
