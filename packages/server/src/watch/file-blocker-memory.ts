import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomically } from '@agent-factory/adapters';
import { z } from 'zod';
import { BLOCKER_KINDS } from './blocker.ts';
import type { BlockerMemory, ReportedBlocker } from './blocker-memory.ts';

export const WATCH_BLOCKERS_FILE = 'watch-blockers.json';
const UTF8 = 'utf8';
const MISSING_FILE_CODE = 'ENOENT';
const JSON_INDENT = 2;

const ReportedBlockerSchema = z.object({
  key: z.string().min(1),
  kind: z.enum(BLOCKER_KINDS),
  project: z.string().nullable(),
  issue: z.number().int().nullable(),
  detail: z.string(),
  reportedAt: z.iso.datetime({ offset: true }),
});
const MemorySchema = z.object({ blockers: z.array(ReportedBlockerSchema) });

/**
 * The blockers reported so far, kept in one file of the installation's state directory and replaced in one step. A file that
 * cannot be read back is an empty memory: the watch reports what it finds again, nothing else is lost.
 */
export class FileBlockerMemory implements BlockerMemory {
  private readonly path: string;

  constructor(stateDirectory: string) {
    this.path = join(stateDirectory, WATCH_BLOCKERS_FILE);
  }

  async recall(): Promise<readonly ReportedBlocker[]> {
    const parsed = MemorySchema.safeParse(await this.read());
    if (!parsed.success) return [];
    return parsed.data.blockers.map(({ reportedAt, ...blocker }) => ({ blocker, reportedAt: new Date(reportedAt) }));
  }

  async remember(reported: readonly ReportedBlocker[]): Promise<void> {
    const blockers = reported.map(({ blocker, reportedAt }) => ({ ...blocker, reportedAt: reportedAt.toISOString() }));
    await writeFileAtomically(this.path, `${JSON.stringify({ blockers }, null, JSON_INDENT)}\n`);
  }

  private async read(): Promise<unknown> {
    try {
      return JSON.parse(await readFile(this.path, UTF8)) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE)) return null;
      throw error;
    }
  }
}
