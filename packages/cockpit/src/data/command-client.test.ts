import { describe, expect, it, vi } from 'vitest';
import { FakeTransport } from '../test/fake-transport.ts';
import { CommandClient, CommandError } from './command-client.ts';

function setup() {
  const transport = new FakeTransport({});
  const onAccepted = vi.fn();
  return { transport, onAccepted, client: new CommandClient(transport, onAccepted) };
}

describe('CommandClient', () => {
  it('sends a valid command and reports what the factory did', async () => {
    const { transport, onAccepted, client } = setup();
    transport.effects.set('issue.start', 'Issue #12 started');
    const accepted = await client.send('issue.start', { project: 'storefront', issueNumber: 12 });
    expect(accepted).toEqual({ sequence: 1, effect: 'Issue #12 started' });
    expect(transport.commands).toEqual([{ name: 'issue.start', body: { project: 'storefront', issueNumber: 12 } }]);
    expect(onAccepted).toHaveBeenCalledWith(accepted);
  });

  it('refuses a body that does not match the command before sending anything', async () => {
    const { transport, onAccepted, client } = setup();
    await expect(client.send('issue.abandon', { project: 'storefront', issueNumber: 12, reason: '   ' })).rejects.toBeInstanceOf(CommandError);
    expect(transport.commands).toEqual([]);
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('turns a refusal of the factory into an error carrying its words', async () => {
    const { transport, onAccepted, client } = setup();
    transport.commandFailure = 'issue 12 is not escalated';
    await expect(client.send('issue.resume', { project: 'storefront', issueNumber: 12 })).rejects.toThrow('issue 12 is not escalated');
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('rejects an answer that does not describe the effect', async () => {
    const { transport, client } = setup();
    transport.sendCommand = () => Promise.resolve({ sequence: 3 });
    await expect(client.send('usage.refresh', {})).rejects.toBeInstanceOf(CommandError);
  });

  it('accepts a command that wrote no event', async () => {
    const { transport, client } = setup();
    transport.sendCommand = () => Promise.resolve({ sequence: null, effect: 'Usage read for 2 accounts' });
    await expect(client.send('usage.refresh', {})).resolves.toEqual({ sequence: null, effect: 'Usage read for 2 accounts' });
  });
});
