import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { argv, env, exit, stdout } from 'node:process';
import { keepAliveWhileParentLives } from './keep-alive.ts';
import { FAKE_LOGGED_IN_STATUS } from './fake-claude-protocol.ts';
import { STUCK_CLAUDE_PIDS_VARIABLE, STUCK_GRANDCHILD_SLEEP_SECONDS } from './stuck-claude-protocol.ts';

const AUTH_COMMAND = 'auth';
const EXIT_CODE_SUCCESS = 0;

/**
 * A Claude CLI that names its login and then never answers anything else, ignores SIGTERM and keeps a child of its own:
 * what a usage probe that waits on a login looks like to the process supervising it.
 */
if (argv[2] === AUTH_COMMAND) {
  stdout.write(`${JSON.stringify(FAKE_LOGGED_IN_STATUS)}\n`);
  exit(EXIT_CODE_SUCCESS);
}

const pidsFile = env[STUCK_CLAUDE_PIDS_VARIABLE];
if (pidsFile === undefined) throw new Error(`${STUCK_CLAUDE_PIDS_VARIABLE} must name the file that receives the process ids`);
process.on('SIGTERM', () => undefined);
const grandchild = spawn('sleep', [STUCK_GRANDCHILD_SLEEP_SECONDS], { stdio: 'ignore' });
writeFileSync(pidsFile, `${process.pid}\n${String(grandchild.pid)}\n`);
keepAliveWhileParentLives();
