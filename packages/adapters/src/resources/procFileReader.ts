import { readFile } from 'node:fs/promises';

export interface ProcFileReader {
  read(path: string): Promise<string | null>;
}

const UTF8 = 'utf8';
const ABSENT_FILE_CODES: readonly string[] = ['ENOENT', 'ENOTDIR', 'EOPNOTSUPP', 'ENOTSUP', 'ENOSYS'];

function isAbsentFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && ABSENT_FILE_CODES.includes(error.code);
}

export class NodeProcFileReader implements ProcFileReader {
  async read(path: string): Promise<string | null> {
    try {
      return await readFile(path, UTF8);
    } catch (error) {
      if (isAbsentFile(error)) return null;
      throw error;
    }
  }
}
