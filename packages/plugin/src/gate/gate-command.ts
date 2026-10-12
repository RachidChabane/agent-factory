import { spawn } from 'node:child_process';
import { signalProcessGroup } from '../process/process-group.ts';
import { BoundedTail } from '../text/bounded-tail.ts';
import { FAILURE_OUTPUT_TAIL_LINES } from '../text/failure-summary.ts';

const SHELL = '/bin/sh';
const SHELL_COMMAND_FLAG = '-c';
const CAPTURED_OUTPUT_MAX_CHARACTERS = 256 * 1024;
const CAPTURED_OUTPUT_MAX_LINES = FAILURE_OUTPUT_TAIL_LINES * 4;
export const GATE_COMMAND_KILL_GRACE_MS = 5_000;
const TERMINATE_SIGNAL = 'SIGTERM';
const KILL_SIGNAL = 'SIGKILL';

export interface GateCommandRun {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly outputTail: string;
  readonly durationMs: number;
}

export interface GateCommandOptions {
  readonly command: string;
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly env: NodeJS.ProcessEnv;
  readonly killGraceMs?: number;
}

export function runGateCommand(options: GateCommandOptions): Promise<GateCommandRun> {
  const startedAt = Date.now();
  const output = new BoundedTail({ maxLines: CAPTURED_OUTPUT_MAX_LINES, maxCharacters: CAPTURED_OUTPUT_MAX_CHARACTERS });
  const child = spawn(SHELL, [SHELL_COMMAND_FLAG, options.command], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => output.append(chunk));
  child.stderr.on('data', (chunk: string) => output.append(chunk));

  let timedOut = false;
  let killTimer: NodeJS.Timeout | undefined;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    signalProcessGroup(child.pid, TERMINATE_SIGNAL);
    killTimer = setTimeout(
      () => signalProcessGroup(child.pid, KILL_SIGNAL),
      options.killGraceMs ?? GATE_COMMAND_KILL_GRACE_MS,
    );
  }, options.timeoutMs);

  const stopTimers = (): void => {
    clearTimeout(timeoutTimer);
    clearTimeout(killTimer);
  };

  return new Promise((resolve, reject) => {
    child.once('error', (error) => {
      stopTimers();
      reject(error);
    });
    child.once('exit', () => signalProcessGroup(child.pid, KILL_SIGNAL));
    child.once('close', (exitCode) => {
      stopTimers();
      resolve({ exitCode, timedOut, outputTail: output.text(), durationMs: Date.now() - startedAt });
    });
  });
}
