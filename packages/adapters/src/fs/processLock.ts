import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const EXCLUSIVE_CREATE = 'wx';
const UTF8 = 'utf8';
const EXISTS_CODE = 'EEXIST';
const MISSING_CODE = 'ENOENT';
const PROCESS_EXISTS_PROBE = 0;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const NO_SUCH_PROCESS_CODE = 'ESRCH';

export class LockHeldError extends Error {
  readonly pid: number;

  constructor(path: string, pid: number) {
    super(`Factory process ${pid} is running and holds ${path}; wait for it to finish or stop it first`);
    this.name = 'LockHeldError';
    this.pid = pid;
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, PROCESS_EXISTS_PROBE);
    return true;
  } catch (error) {
    return !hasCode(error, NO_SUCH_PROCESS_CODE);
  }
}

export async function lockHolder(path: string): Promise<number | null> {
  try {
    const pid = Number((await readFile(path, UTF8)).trim());
    return Number.isInteger(pid) && pid > 0 && isProcessAlive(pid) ? pid : null;
  } catch (error) {
    if (hasCode(error, MISSING_CODE)) return null;
    throw error;
  }
}

export class ProcessLock {
  private readonly path: string;
  private readonly pid: number;
  private held = false;

  constructor(path: string, pid: number = process.pid) {
    this.path = path;
    this.pid = pid;
  }

  async acquire(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    try {
      await writeFile(this.path, `${this.pid}\n`, { flag: EXCLUSIVE_CREATE, mode: PRIVATE_FILE_MODE });
      this.held = true;
      return;
    } catch (error) {
      if (!hasCode(error, EXISTS_CODE)) throw error;
    }
    const holder = await lockHolder(this.path);
    if (holder !== null && holder !== this.pid) throw new LockHeldError(this.path, holder);
    await unlink(this.path).catch((error: unknown) => {
      if (!hasCode(error, MISSING_CODE)) throw error;
    });
    await writeFile(this.path, `${this.pid}\n`, { flag: EXCLUSIVE_CREATE, mode: PRIVATE_FILE_MODE });
    this.held = true;
  }

  async release(): Promise<void> {
    if (!this.held) return;
    this.held = false;
    const holder = await lockHolder(this.path);
    if (holder === this.pid) await unlink(this.path).catch(() => undefined);
  }
}
