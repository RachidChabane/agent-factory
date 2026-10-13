const BYTES_PER_KILOBYTE = 1_000;
const UNIT_RATIO = 1_000;
const DECIMALS_FACTOR = 10;

interface ByteUnit {
  readonly suffix: string;
  readonly bytes: number;
}

const KILOBYTE: ByteUnit = { suffix: 'kB', bytes: BYTES_PER_KILOBYTE };
const MEGABYTE: ByteUnit = { suffix: 'MB', bytes: KILOBYTE.bytes * UNIT_RATIO };
const GIGABYTE: ByteUnit = { suffix: 'GB', bytes: MEGABYTE.bytes * UNIT_RATIO };
const UNITS: readonly ByteUnit[] = [KILOBYTE, MEGABYTE, GIGABYTE];

function roundedUp(bytes: number, unit: ByteUnit): number {
  return Math.ceil((bytes / unit.bytes) * DECIMALS_FACTOR) / DECIMALS_FACTOR;
}

/**
 * A size in decimal units (1 MB is a million bytes), with at most one decimal, rounded up: a size never reads
 * as the limit it passes.
 */
export function describeBytes(bytes: number): string {
  if (bytes < BYTES_PER_KILOBYTE) return `${bytes} B`;
  const unit = UNITS.find((candidate) => roundedUp(bytes, candidate) < UNIT_RATIO) ?? GIGABYTE;
  return `${roundedUp(bytes, unit)} ${unit.suffix}`;
}
