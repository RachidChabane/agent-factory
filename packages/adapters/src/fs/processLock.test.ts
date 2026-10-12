import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lockHolder, LockHeldError, ProcessLock } from './processLock.ts';

const UNUSED_PID = 2_147_483_000;

describe('ProcessLock', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'factory-lock-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('holds the lock for one live process and frees it on release', async () => {
    const path = join(directory, 'state', 'factory.lock');
    const lock = new ProcessLock(path);
    await lock.acquire();
    expect(await lockHolder(path)).toBe(process.pid);
    await expect(new ProcessLock(path, process.pid + 1).acquire()).rejects.toBeInstanceOf(LockHeldError);
    await lock.release();
    expect(await lockHolder(path)).toBeNull();
  });

  it('takes over a lock left by a process that no longer exists', async () => {
    const path = join(directory, 'factory.lock');
    await writeFile(path, `${UNUSED_PID}\n`);
    await new ProcessLock(path).acquire();
    expect((await readFile(path, 'utf8')).trim()).toBe(String(process.pid));
  });
});
