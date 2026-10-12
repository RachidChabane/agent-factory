import type { CommandRunner, ResourceGuard } from '@agent-factory/application';
import { MAX_PERCENT } from '@agent-factory/domain';
import type { MemoryPressureLevel, ResourceSnapshot } from '@agent-factory/domain';
import { ResourceProbeError } from './errors.ts';

export const MEMORY_PRESSURE_COMMAND: readonly string[] = ['memory_pressure', '-Q'];
export const PRESSURE_LEVEL_COMMAND: readonly string[] = ['sysctl', '-n', 'kern.memorystatus_vm_pressure_level'];
export const RESOURCE_PROBE_TIMEOUT_MS = 15_000;
const EXIT_CODE_OK = 0;
const FREE_PERCENTAGE_LINE = /System-wide memory free percentage:\s*(\d{1,3})%/;
const ROOT_DIRECTORY = '/';

export const PRESSURE_LEVEL_BY_KERNEL_VALUE: Readonly<Record<string, MemoryPressureLevel>> = {
  '1': 'normal',
  '2': 'warn',
  '4': 'critical',
};

export function parseFreeMemoryPercent(output: string): number {
  const match = FREE_PERCENTAGE_LINE.exec(output);
  const value = Number(match?.[1]);
  if (match === null || !Number.isInteger(value) || value > MAX_PERCENT) {
    throw new ResourceProbeError('the free memory percentage', 'no "System-wide memory free percentage" line');
  }
  return value;
}

export function parsePressureLevel(output: string): MemoryPressureLevel {
  const level = PRESSURE_LEVEL_BY_KERNEL_VALUE[output.trim()];
  if (level === undefined) throw new ResourceProbeError('the memory pressure level', `unknown kernel value ${JSON.stringify(output.trim())}`);
  return level;
}

export class MacosResourceGuard implements ResourceGuard {
  private readonly runner: CommandRunner;
  private readonly environment: Readonly<Record<string, string>>;

  constructor(runner: CommandRunner, environment: Readonly<Record<string, string>>) {
    this.runner = runner;
    this.environment = environment;
  }

  async snapshot(): Promise<ResourceSnapshot> {
    const [free, pressure] = await Promise.all([this.output(MEMORY_PRESSURE_COMMAND), this.output(PRESSURE_LEVEL_COMMAND)]);
    return { freeMemoryPercent: parseFreeMemoryPercent(free), pressure: parsePressureLevel(pressure) };
  }

  private async output(command: readonly string[]): Promise<string> {
    const result = await this.runner.run(command, ROOT_DIRECTORY, RESOURCE_PROBE_TIMEOUT_MS, this.environment);
    if (result.exitCode !== EXIT_CODE_OK || result.timedOut) {
      throw new ResourceProbeError(command.join(' '), result.timedOut ? 'timed out' : `exit code ${result.exitCode}: ${result.stderr.trim()}`);
    }
    return result.stdout;
  }
}
