import { exit } from 'node:process';

const PARENT_CHECK_MS = 1_000;
const ORPHANED_EXIT_CODE = 1;
/** Read as soon as the module loads: a parent that dies while the process is still starting must still be noticed. */
const STARTED_BY = process.ppid;

/**
 * Keeps the process running for as long as the process that started it does. A fixture that waits for ever must not
 * outlive its test, however the test ends: a runner that is killed cannot stop the process it started.
 */
export function keepAliveWhileParentLives(): void {
  setInterval(() => {
    if (process.ppid !== STARTED_BY) exit(ORPHANED_EXIT_CODE);
  }, PARENT_CHECK_MS);
}
