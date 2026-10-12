import type { ResourceGuard } from '@agent-factory/application';
import { MAX_PERCENT } from '@agent-factory/domain';
import type { MemoryPressureLevel, ResourceSnapshot } from '@agent-factory/domain';
import { ResourceProbeError } from './errors.ts';
import { NodeProcFileReader, type ProcFileReader } from './procFileReader.ts';

export const MEMINFO_PATH = '/proc/meminfo';
export const MEMORY_PRESSURE_PATH = '/proc/pressure/memory';
export const WARN_STALL_PERCENT = 10;
export const CRITICAL_STALL_PERCENT = 40;
export const PRESSURE_WITHOUT_PSI: MemoryPressureLevel = 'normal';

const MEMORY_FIELD_LINE = /^([^:\s]+):\s+(\d+)(?:\s*kB)?\s*$/;
const TOTAL_FIELD = 'MemTotal';
const AVAILABLE_FIELD = 'MemAvailable';
const SOME_STALL_LINE = /^some\b[^\n]*?\bavg10=(\d+(?:\.\d+)?)/m;
const NEWLINE = '\n';
const FREE_MEMORY = 'the free memory percentage';
const MEMORY_PRESSURE = 'the memory pressure level';

function memoryFields(meminfo: string): ReadonlyMap<string, number> {
  const fields = new Map<string, number>();
  for (const line of meminfo.split(NEWLINE)) {
    const match = MEMORY_FIELD_LINE.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) fields.set(match[1], Number(match[2]));
  }
  return fields;
}

export function parseAvailableMemoryPercent(meminfo: string): number {
  const fields = memoryFields(meminfo);
  const total = fields.get(TOTAL_FIELD);
  const available = fields.get(AVAILABLE_FIELD);
  if (total === undefined || total <= 0) throw new ResourceProbeError(FREE_MEMORY, `no usable ${TOTAL_FIELD} line in ${MEMINFO_PATH}`);
  if (available === undefined) throw new ResourceProbeError(FREE_MEMORY, `no ${AVAILABLE_FIELD} line in ${MEMINFO_PATH}`);
  return Math.min(MAX_PERCENT, Math.floor((available * MAX_PERCENT) / total));
}

export function pressureLevelOf(stalledPercent: number): MemoryPressureLevel {
  if (stalledPercent >= CRITICAL_STALL_PERCENT) return 'critical';
  return stalledPercent >= WARN_STALL_PERCENT ? 'warn' : 'normal';
}

export function parseMemoryPressure(pressure: string): MemoryPressureLevel {
  const match = SOME_STALL_LINE.exec(pressure);
  if (match?.[1] === undefined) throw new ResourceProbeError(MEMORY_PRESSURE, `no "some avg10" value in ${MEMORY_PRESSURE_PATH}`);
  return pressureLevelOf(Number(match[1]));
}

export class LinuxResourceGuard implements ResourceGuard {
  private readonly reader: ProcFileReader;

  constructor(reader: ProcFileReader = new NodeProcFileReader()) {
    this.reader = reader;
  }

  async snapshot(): Promise<ResourceSnapshot> {
    const [meminfo, pressure] = await Promise.all([this.read(MEMINFO_PATH, FREE_MEMORY), this.read(MEMORY_PRESSURE_PATH, MEMORY_PRESSURE)]);
    if (meminfo === null) throw new ResourceProbeError(FREE_MEMORY, `${MEMINFO_PATH} is not available`);
    return {
      freeMemoryPercent: parseAvailableMemoryPercent(meminfo),
      pressure: pressure === null ? PRESSURE_WITHOUT_PSI : parseMemoryPressure(pressure),
    };
  }

  private async read(path: string, what: string): Promise<string | null> {
    try {
      return await this.reader.read(path);
    } catch (error) {
      throw new ResourceProbeError(what, `${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
