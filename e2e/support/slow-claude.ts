import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Stands between the factory and the fake Claude. While the hold file exists, an agent run waits before it
 * starts, so a spec can click Stop on a run that is in progress; every other call passes straight through.
 * Usage: slow-claude.ts --hold-file <path> -- <fake claude command and arguments>
 */
const POLL_MS = 200;
const HOLD_LIMIT_MS = 180_000;
const AGENT_RUN_FLAG = '--permission-mode';
const SIGTERM_EXIT_CODE = 143;

function parse(argv: readonly string[]): { holdFile: string; command: readonly string[]; flags: readonly string[] } {
  const holdFile = argv[1];
  const separator = argv.indexOf('--');
  const command = argv.slice(separator + 1);
  if (argv[0] !== '--hold-file' || holdFile === undefined || separator < 0 || command.length === 0) throw new Error('usage: slow-claude.ts --hold-file <path> -- <command...>');
  return { holdFile, command, flags: argv.slice(separator + 1) };
}

async function holdWhileAsked(holdFile: string): Promise<void> {
  const started = Date.now();
  while (existsSync(holdFile) && Date.now() - started < HOLD_LIMIT_MS) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

const { holdFile, command, flags } = parse(process.argv.slice(2));
const isAgentRun = flags.includes(AGENT_RUN_FLAG);
if (isAgentRun) await holdWhileAsked(holdFile);
const [program, ...args] = command;
if (program === undefined) throw new Error('no command to run');
const child = spawn(program, args, { stdio: 'inherit' });
process.once('SIGTERM', () => {
  child.kill('SIGTERM');
  process.exit(SIGTERM_EXIT_CODE);
});
child.once('exit', (code, signal) => process.exit(signal === null ? (code ?? 1) : SIGTERM_EXIT_CODE));
