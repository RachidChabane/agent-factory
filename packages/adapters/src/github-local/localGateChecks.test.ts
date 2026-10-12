import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalGateChecks, type LocalCheckRun, type LocalCheckRunner } from './localGateChecks.ts';

const CLOCK = { now: () => new Date('2026-10-12T09:00:00.000Z') };
const PASSED: LocalCheckRun = { steps: [{ name: 'test', passed: true, durationMs: 1_500 }], log: 'ok\n' };

class CountingRunner implements LocalCheckRunner {
  running = 0;
  mostAtOnce = 0;
  readonly order: string[] = [];

  async run(sha: string): Promise<LocalCheckRun> {
    this.running += 1;
    this.mostAtOnce = Math.max(this.mostAtOnce, this.running);
    this.order.push(sha);
    await new Promise((resolve) => setTimeout(resolve, 15));
    this.running -= 1;
    return PASSED;
  }
}

describe('the gates of a local forge', () => {
  let forge: string;

  beforeEach(async () => {
    forge = await mkdtemp(join(tmpdir(), 'factory-local-gates-'));
  });

  afterEach(async () => {
    await rm(forge, { recursive: true, force: true });
  });

  it('run one at a time, as a forge with a single runner, each commit pending until its turn has run', async () => {
    const runner = new CountingRunner();
    const checks = new LocalGateChecks(forge, runner, CLOCK, new AbortController().signal);
    const shas = ['a1', 'b2', 'c3'];
    for (const sha of shas) expect((await checks.of(sha)).map((check) => check.conclusion)).toEqual(['pending']);
    await checks.settled();
    expect(runner.mostAtOnce).toBe(1);
    expect(runner.order).toEqual(shas);
    for (const sha of shas) expect(await checks.of(sha)).toEqual([{ name: 'test', conclusion: 'success', url: expect.stringContaining(`${sha}.log`), durationMs: 1_500 }]);
  });
});
