const PROCESS_NOT_FOUND = 'ESRCH';

export function signalProcessGroup(leaderPid: number | undefined, signal: NodeJS.Signals): boolean {
  if (leaderPid === undefined) {
    return false;
  }
  try {
    process.kill(-leaderPid, signal);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === PROCESS_NOT_FOUND) {
      return false;
    }
    throw error;
  }
}
