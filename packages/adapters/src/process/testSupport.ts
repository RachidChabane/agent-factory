const PROCESS_GONE_DEADLINE_MS = 5_000;
const POLL_INTERVAL_MS = 50;
/** Signal 0 delivers nothing; it only tells whether the process exists. */
const EXISTENCE_CHECK = 0;

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, EXISTENCE_CHECK);
    return true;
  } catch {
    return false;
  }
}

export async function waitUntilGone(pid: number, deadlineMs: number = PROCESS_GONE_DEADLINE_MS): Promise<boolean> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return !isAlive(pid);
}

/** Stops a process a test started, whatever way the test ended. */
export function killIfAlive(pid: number): void {
  if (isAlive(pid)) process.kill(pid, 'SIGKILL');
}

/** The process ids a fixture wrote to a file, one per line; empty until the fixture has written them. */
export function parsePids(text: string): readonly number[] {
  return text
    .split('\n')
    .map((line) => Number.parseInt(line, 10))
    .filter((pid) => !Number.isNaN(pid));
}
