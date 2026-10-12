import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { ResourceProbeError } from './errors.ts';
import { MacosResourceGuard, parseFreeMemoryPercent, parsePressureLevel } from './macosResourceGuard.ts';

const FIXTURE = new URL('./fixtures/memory-pressure-darwin.txt', import.meta.url);

class RecordedRunner implements CommandRunner {
  readonly outputs: Readonly<Record<string, CommandResult>>;

  constructor(outputs: Readonly<Record<string, CommandResult>>) {
    this.outputs = outputs;
  }

  run(command: readonly string[]): Promise<CommandResult> {
    const result = this.outputs[command[0] ?? ''];
    return result === undefined ? Promise.reject(new Error(`unexpected ${command.join(' ')}`)) : Promise.resolve(result);
  }
}

function ok(stdout: string): CommandResult {
  return { exitCode: 0, stdout, stderr: '', durationMs: 5, timedOut: false };
}

describe('macOS resource guard', () => {
  it('reads the free memory percentage from memory_pressure output', async () => {
    expect(parseFreeMemoryPercent(await readFile(FIXTURE, 'utf8'))).toBe(57);
  });

  it('maps the kernel pressure level', () => {
    expect(parsePressureLevel('1\n')).toBe('normal');
    expect(parsePressureLevel('2')).toBe('warn');
    expect(parsePressureLevel('4')).toBe('critical');
    expect(() => parsePressureLevel('9')).toThrow(ResourceProbeError);
  });

  it('refuses output without the free percentage line', () => {
    expect(() => parseFreeMemoryPercent('Pages free: 12503')).toThrow(ResourceProbeError);
  });

  it('combines both probes into one snapshot', async () => {
    const guard = new MacosResourceGuard(
      new RecordedRunner({ memory_pressure: ok(await readFile(FIXTURE, 'utf8')), sysctl: ok('2\n') }),
      {},
    );
    expect(await guard.snapshot()).toEqual({ freeMemoryPercent: 57, pressure: 'warn' });
  });

  it('fails loudly when a probe fails', async () => {
    const guard = new MacosResourceGuard(
      new RecordedRunner({ memory_pressure: { ...ok(''), exitCode: 1, stderr: 'denied' }, sysctl: ok('1') }),
      {},
    );
    await expect(guard.snapshot()).rejects.toThrow('exit code 1: denied');
  });
});
