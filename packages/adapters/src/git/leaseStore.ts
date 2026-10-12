import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { CorruptLeaseFileError } from './errors.ts';

const LeaseSchema = z.object({
  slot: z.number().int().nonnegative(),
  issueNumber: z.number().int(),
  branch: z.string().min(1),
});
const LeaseFileSchema = z.object({ leases: z.array(LeaseSchema) });

export type Lease = z.infer<typeof LeaseSchema>;

export class LeaseStore {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async read(): Promise<readonly Lease[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
    const parsed = LeaseFileSchema.safeParse(parseJson(raw));
    if (!parsed.success) throw new CorruptLeaseFileError(this.path, parsed.error);
    return parsed.data.leases;
  }

  async write(leases: readonly Lease[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.tmp`;
    await writeFile(temporaryPath, JSON.stringify({ leases }, null, 2));
    await rename(temporaryPath, this.path);
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
