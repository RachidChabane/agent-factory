import { describe, expect, it, vi } from 'vitest';
import { FakeTransport } from '../test/fake-transport.ts';
import { fixtureSnapshot } from '../test/render.tsx';
import { CommandClient, CommandError } from './command-client.ts';

describe('CommandClient', () => {
  it('validates the body, posts it and returns the resulting sequence', async () => {
    const transport = new FakeTransport(fixtureSnapshot(), 100);
    const accepted = vi.fn();
    const client = new CommandClient(transport, accepted);
    await expect(client.send('pr.merge', { number: 311, expectedHeadSha: 'abc' })).resolves.toBe(101);
    expect(transport.commands).toEqual([{ name: 'pr.merge', body: { number: 311, expectedHeadSha: 'abc' } }]);
    expect(accepted).toHaveBeenCalledWith(101);
  });

  it('refuses an invalid body before reaching the network', async () => {
    const transport = new FakeTransport(fixtureSnapshot());
    const client = new CommandClient(transport, vi.fn());
    await expect(client.send('audit.resolve', { auditId: 'A-15', note: '' })).rejects.toBeInstanceOf(CommandError);
    expect(transport.commands).toHaveLength(0);
  });

  it('wraps transport failures and malformed answers', async () => {
    const transport = new FakeTransport(fixtureSnapshot());
    transport.commandFailure = 'server down';
    const client = new CommandClient(transport, vi.fn());
    await expect(client.send('scheduler.pause', {})).rejects.toThrow('server down');
    transport.commandFailure = null;
    transport.sendCommand = async () => ({ ok: true });
    await expect(client.send('scheduler.pause', {})).rejects.toBeInstanceOf(CommandError);
  });
});
