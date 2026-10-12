import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { MAX_PERCENT, MEMORY_PRESSURE_LEVELS, type MemoryPressureLevel } from '@agent-factory/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ResourceProbeError } from './errors.ts';
import {
  CRITICAL_STALL_PERCENT,
  LinuxResourceGuard,
  MEMINFO_PATH,
  MEMORY_PRESSURE_PATH,
  parseAvailableMemoryPercent,
  parseMemoryPressure,
  pressureLevelOf,
  WARN_STALL_PERCENT,
} from './linuxResourceGuard.ts';
import { NodeProcFileReader, type ProcFileReader } from './procFileReader.ts';

const MEMINFO = readFile(new URL('./fixtures/meminfo-linux.txt', import.meta.url), 'utf8');
const IDLE_PRESSURE = readFile(new URL('./fixtures/pressure-memory-linux.txt', import.meta.url), 'utf8');
const STALLED_PRESSURE = readFile(new URL('./fixtures/pressure-memory-linux-stalled.txt', import.meta.url), 'utf8');
const MAX_MEMORY_KB = 2 ** 40;

interface StallCase {
  readonly hundredths: number;
  readonly level: MemoryPressureLevel;
}

const STALL_CASES: readonly StallCase[] = [
  { hundredths: 0, level: 'normal' },
  { hundredths: 999, level: 'normal' },
  { hundredths: 1_000, level: 'warn' },
  { hundredths: 3_999, level: 'warn' },
  { hundredths: 4_000, level: 'critical' },
  { hundredths: 10_000, level: 'critical' },
];

class FixtureReader implements ProcFileReader {
  private readonly files: ReadonlyMap<string, string>;

  constructor(files: Readonly<Record<string, string>>) {
    this.files = new Map(Object.entries(files));
  }

  read(path: string): Promise<string | null> {
    return Promise.resolve(this.files.get(path) ?? null);
  }
}

class FailingReader implements ProcFileReader {
  read(path: string): Promise<string | null> {
    return Promise.reject(new Error(`EACCES: permission denied, open '${path}'`));
  }
}

function meminfo(totalKb: number, availableKb: number): string {
  return [`MemTotal:       ${totalKb} kB`, 'MemFree:           1024 kB', `MemAvailable:   ${availableKb} kB`, 'HugePages_Total:       0'].join('\n');
}

function stall(hundredths: number): string {
  return `some avg10=${(hundredths / 100).toFixed(2)} avg60=0.00 avg300=0.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=1\n`;
}

function severity(level: MemoryPressureLevel): number {
  return MEMORY_PRESSURE_LEVELS.indexOf(level);
}

describe('parseAvailableMemoryPercent', () => {
  it('divides MemAvailable by MemTotal from a real /proc/meminfo', async () => {
    expect(parseAvailableMemoryPercent(await MEMINFO)).toBe(60);
  });

  it('rounds down, so free memory is never overstated', () => {
    expect(parseAvailableMemoryPercent(meminfo(1_000, 399))).toBe(39);
    expect(parseAvailableMemoryPercent(meminfo(1_000, 400))).toBe(40);
  });

  it('never reports more than all the memory', () => {
    expect(parseAvailableMemoryPercent(meminfo(1_000, 1_500))).toBe(MAX_PERCENT);
  });

  it.each([
    ['MemAvailable', 'MemTotal:   16324112 kB\nMemFree:   1923456 kB'],
    ['MemTotal', 'MemFree:   1923456 kB\nMemAvailable:   1923456 kB'],
    ['MemTotal', meminfo(0, 0)],
    ['MemTotal', ''],
  ])('refuses a /proc/meminfo without a usable %s line', (field, text) => {
    expect(() => parseAvailableMemoryPercent(text)).toThrow(ResourceProbeError);
    expect(() => parseAvailableMemoryPercent(text)).toThrow(field);
  });

  it('is an integer between 0 and 100 that grows with the available memory', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_MEMORY_KB }), fc.nat(MAX_MEMORY_KB), fc.nat(MAX_MEMORY_KB), (total, first, second) => {
        const [smaller, larger] = [Math.min(first, total), Math.min(second, total)].sort((a, b) => a - b);
        const low = parseAvailableMemoryPercent(meminfo(total, smaller ?? 0));
        const high = parseAvailableMemoryPercent(meminfo(total, larger ?? 0));
        expect(Number.isInteger(low) && Number.isInteger(high)).toBe(true);
        expect(low).toBeGreaterThanOrEqual(0);
        expect(high).toBeLessThanOrEqual(MAX_PERCENT);
        expect(low).toBeLessThanOrEqual(high);
      }),
    );
  });

  it('equals the exact integer quotient of the two fields', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_MEMORY_KB }), fc.nat(MAX_MEMORY_KB), (total, requested) => {
        const available = Math.min(requested, total);
        expect(parseAvailableMemoryPercent(meminfo(total, available))).toBe(Number((BigInt(available) * BigInt(MAX_PERCENT)) / BigInt(total)));
      }),
    );
  });
});

describe('parseMemoryPressure', () => {
  it('reads an idle machine as normal and a thrashing one as critical', async () => {
    expect(parseMemoryPressure(await IDLE_PRESSURE)).toBe('normal');
    expect(parseMemoryPressure(await STALLED_PRESSURE)).toBe('critical');
  });

  it.each(STALL_CASES)('reads $hundredths hundredths of a percent of stalled time as $level', ({ hundredths, level }) => {
    expect(parseMemoryPressure(stall(hundredths))).toBe(level);
  });

  it('draws the lines at ten and forty percent', () => {
    expect(WARN_STALL_PERCENT).toBe(10);
    expect(CRITICAL_STALL_PERCENT).toBe(40);
  });

  it('looks at the some line and at the ten-second average only', () => {
    expect(parseMemoryPressure('full avg10=90.00 avg60=90.00 avg300=90.00 total=1\nsome avg10=1.00 avg60=80.00 avg300=80.00 total=1\n')).toBe('normal');
  });

  it.each(['', 'full avg10=1.00 avg60=0.00 avg300=0.00 total=1', 'some avg60=1.00 avg300=0.00 total=1', 'some avg10=high', 'unrelated'])(
    'refuses %j',
    (text) => {
      expect(() => parseMemoryPressure(text)).toThrow(ResourceProbeError);
    },
  );

  it('maps a growing stall to a pressure that never eases', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 10_000 }), (first, second) => {
        const [low, high] = [first, second].sort((a, b) => a - b);
        expect(severity(parseMemoryPressure(stall(low ?? 0)))).toBeLessThanOrEqual(severity(parseMemoryPressure(stall(high ?? 0))));
      }),
    );
  });

  it('draws the lines at the named thresholds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (hundredths) => {
        const percent = hundredths / 100;
        const expected = percent >= CRITICAL_STALL_PERCENT ? 'critical' : percent >= WARN_STALL_PERCENT ? 'warn' : 'normal';
        expect(parseMemoryPressure(stall(hundredths))).toBe(expected);
        expect(pressureLevelOf(percent)).toBe(expected);
      }),
    );
  });

  it('answers with a level or refuses, whatever it is given', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        try {
          expect(MEMORY_PRESSURE_LEVELS).toContain(parseMemoryPressure(text));
        } catch (error) {
          expect(error).toBeInstanceOf(ResourceProbeError);
        }
      }),
    );
  });
});

describe('LinuxResourceGuard', () => {
  it('combines /proc/meminfo and /proc/pressure/memory into one snapshot', async () => {
    const reader = new FixtureReader({ [MEMINFO_PATH]: await MEMINFO, [MEMORY_PRESSURE_PATH]: await STALLED_PRESSURE });
    expect(await new LinuxResourceGuard(reader).snapshot()).toEqual({ freeMemoryPercent: 60, pressure: 'critical' });
  });

  it('reads the pressure as normal on a kernel that offers no pressure stall information', async () => {
    const reader = new FixtureReader({ [MEMINFO_PATH]: await MEMINFO });
    expect(await new LinuxResourceGuard(reader).snapshot()).toEqual({ freeMemoryPercent: 60, pressure: 'normal' });
  });

  it('fails loudly without /proc/meminfo', async () => {
    const guard = new LinuxResourceGuard(new FixtureReader({ [MEMORY_PRESSURE_PATH]: await IDLE_PRESSURE }));
    await expect(guard.snapshot()).rejects.toThrow(ResourceProbeError);
    await expect(guard.snapshot()).rejects.toThrow(`${MEMINFO_PATH} is not available`);
  });

  it('fails loudly on a pressure file it cannot read, naming the file', async () => {
    await expect(new LinuxResourceGuard(new FailingReader()).snapshot()).rejects.toThrow(ResourceProbeError);
    await expect(new LinuxResourceGuard(new FailingReader()).snapshot()).rejects.toThrow('permission denied');
  });

  it('fails loudly on a pressure file it cannot parse', async () => {
    const reader = new FixtureReader({ [MEMINFO_PATH]: await MEMINFO, [MEMORY_PRESSURE_PATH]: 'garbled' });
    await expect(new LinuxResourceGuard(reader).snapshot()).rejects.toThrow(ResourceProbeError);
  });

  it.skipIf(process.platform !== 'linux')('reads the live /proc of this machine', async () => {
    const snapshot = await new LinuxResourceGuard().snapshot();
    expect(snapshot.freeMemoryPercent).toBeGreaterThanOrEqual(0);
    expect(snapshot.freeMemoryPercent).toBeLessThanOrEqual(MAX_PERCENT);
    expect(MEMORY_PRESSURE_LEVELS).toContain(snapshot.pressure);
  });
});

describe('NodeProcFileReader', () => {
  let directory: string;
  let file: string;

  beforeAll(async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), 'factory-proc-')));
    file = join(directory, 'meminfo');
    await mkdir(join(directory, 'nested'));
    await writeFile(file, 'MemTotal: 1 kB\n');
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns the content of a file', async () => {
    expect(await new NodeProcFileReader().read(file)).toBe('MemTotal: 1 kB\n');
  });

  it('returns null for a file the kernel does not provide', async () => {
    expect(await new NodeProcFileReader().read(join(directory, 'absent'))).toBeNull();
    expect(await new NodeProcFileReader().read(join(file, 'below-a-file'))).toBeNull();
  });

  it('lets any other failure through', async () => {
    await expect(new NodeProcFileReader().read(join(directory, 'nested'))).rejects.toMatchObject({ code: 'EISDIR' });
  });
});
