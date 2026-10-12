import { readFile } from 'node:fs/promises';

const UTF8 = 'utf8';
const MISSING_FILE_CODE = 'ENOENT';

export async function readDecisionRequest(file: string | null): Promise<string | null> {
  if (file === null) return null;
  try {
    const request = (await readFile(file, UTF8)).trim();
    return request === '' ? null : request;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE) return null;
    throw error;
  }
}
