import { execFileSync } from 'node:child_process';

/** Signal 0 delivers nothing; it only tells whether the process exists. */
const EXISTENCE_CHECK = 0;
const PROCESS_TABLE_ARGUMENTS = ['-A', '-o', 'pid=,ppid='];

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, EXISTENCE_CHECK);
    return true;
  } catch {
    return false;
  }
}

/** Every process below `root`, including the ones a command runner started in a process group of their own. */
export function descendantsOf(root: number): readonly number[] {
  const table = execFileSync('ps', PROCESS_TABLE_ARGUMENTS, { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const found: number[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const parent = queue.shift();
    for (const [pid, ppid] of table) {
      if (ppid === parent && pid !== undefined && !found.includes(pid)) {
        found.push(pid);
        queue.push(pid);
      }
    }
  }
  return found;
}

/**
 * Stops a process and everything below it, the process first so that it starts nothing more: a test that fails halfway
 * must not leave the children of a factory running.
 */
export function killProcessTree(root: number): void {
  const below = descendantsOf(root);
  for (const pid of [root, ...below]) {
    if (isAlive(pid)) process.kill(pid, 'SIGKILL');
  }
}
