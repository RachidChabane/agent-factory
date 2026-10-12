import { describe, expect, it } from 'vitest';
import { ListeningPorts } from './listening-ports.ts';

describe('ListeningPorts', () => {
  it('lists the configured ports and those registered once a listener is bound, without duplicates', () => {
    const listening = new ListeningPorts([7430, 5199]);
    listening.register(40_123);
    listening.register(7430);
    expect(listening.ports()).toEqual([7430, 5199, 40_123]);
  });

  it('ignores port 0, which asks the system for a free port and names no listener', () => {
    const listening = new ListeningPorts([0]);
    listening.register(0);
    expect(listening.ports()).toEqual([]);
  });
});
