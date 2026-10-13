import { fileURLToPath } from 'node:url';

export const STUCK_CLAUDE_SCRIPT = fileURLToPath(new URL('./stuck-claude.ts', import.meta.url));
/** The environment variable naming the file where the fixture writes the ids of the processes it started, one per line. */
export const STUCK_CLAUDE_PIDS_VARIABLE = 'STUCK_CLAUDE_PIDS';
export const STUCK_GRANDCHILD_SLEEP_SECONDS = '120';
