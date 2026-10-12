import { describe, expect, it } from 'vitest';
import type { StateAnswer } from './cockpit-client.ts';
import type { CliRun } from './factory-cli.ts';
import { gateChecksLook, type GateChecksSources } from './gate-checks-look.ts';
import type { GateOutcome } from './local-forge.ts';

const SHA = '4961798ec085a3693f294496970c3b7926e925c8';
const ANSWERED: StateAnswer = { status: 200, detail: 'GET /api/state answered 200' };
const PASSED: GateOutcome = { sha: SHA, steps: [{ name: 'lint', passed: true }, { name: 'unit', passed: true }] };

function sources(overrides: Partial<GateChecksSources> = {}): GateChecksSources & { readonly requests: () => number } {
  let requests = 0;
  return {
    requestState: () => {
      requests += 1;
      return Promise.resolve(ANSWERED);
    },
    outcome: () => Promise.resolve(null),
    log: () => Promise.resolve(null),
    factoryEnded: () => null,
    ...overrides,
    requests: () => requests,
  };
}

describe('gateChecksLook', () => {
  it('asks the cockpit for its state at every look, which is what makes the forge run the gate', async () => {
    const watched = sources();
    const look = gateChecksLook(SHA, watched);
    await look();
    await look();
    expect(watched.requests()).toBe(2);
  });

  it('waits while the forge records no checks, saying how the cockpit answered', async () => {
    const poll = await gateChecksLook(SHA, sources())();
    expect(poll).toEqual({ kind: 'waiting', observed: 'no checks recorded for 4961798 yet (GET /api/state answered 200)' });
  });

  it('is ready once every step of the gate is recorded as passed', async () => {
    const poll = await gateChecksLook(SHA, sources({ outcome: () => Promise.resolve(PASSED) }))();
    expect(poll).toEqual({ kind: 'ready', value: PASSED });
  });

  it('fails at once when a step failed, with the end of the gate log', async () => {
    const failedGate: GateOutcome = { sha: SHA, steps: [{ name: 'lint', passed: true }, { name: 'unit', passed: false }] };
    const poll = await gateChecksLook(SHA, sources({ outcome: () => Promise.resolve(failedGate), log: () => Promise.resolve('$ node --test\nnot ok 1 - cart totals\n[exit code 1]\n') }))();
    expect(poll.kind).toBe('failed');
    expect(poll.kind === 'failed' ? poll.reason : '').toBe('the gate of 4961798 failed at unit\n$ node --test\nnot ok 1 - cart totals\n[exit code 1]');
  });

  it('fails at once when the factory has ended, before it recorded anything', async () => {
    const ended: CliRun = { command: 'agent-factory start', exitCode: 1, output: 'Another factory runs on this installation\n', durationMs: 40, timedOut: false, killed: false };
    const watched = sources({ factoryEnded: () => ended });
    const poll = await gateChecksLook(SHA, watched)();
    expect(poll.kind === 'failed' ? poll.reason : '').toContain('Another factory runs on this installation');
    expect(watched.requests()).toBe(0);
  });
});
