import { spawn, type ChildProcess } from 'node:child_process';
import type { HookExecution } from './hook-decisions.ts';
import type { HookInvocation, HookRunner } from './hook-runner.ts';

const SHELL = '/bin/sh';
const SHELL_COMMAND_FLAG = '-c';
const KILL_SIGNAL = 'SIGKILL';
const PROJECT_DIRECTORY_VARIABLE = 'CLAUDE_PROJECT_DIR';
const OUTPUT_ENCODING = 'utf8';
const PAYLOAD_TERMINATOR = '\n';
export const HOOK_OUTPUT_LIMIT_CHARACTERS = 1_000_000;
export const STREAM_DRAIN_GRACE_MS = 250;

class BoundedText {
  readonly #limit: number;
  #text = '';

  constructor(limit: number) {
    this.#limit = limit;
  }

  append(chunk: string): void {
    const room = this.#limit - this.#text.length;
    if (room > 0) {
      this.#text += chunk.slice(0, room);
    }
  }

  get text(): string {
    return this.#text;
  }
}

/**
 * Runs a hook the way the CLI does: as a shell command in the working directory, the JSON payload on
 * its standard input. The child stays in this process's group, so whoever terminates the group ends the hook too.
 */
export class ShellHookRunner implements HookRunner {
  readonly #environment: NodeJS.ProcessEnv;

  constructor(environment: NodeJS.ProcessEnv) {
    this.#environment = environment;
  }

  run(invocation: HookInvocation): Promise<HookExecution> {
    return new Promise((resolve) => {
      const child = spawn(SHELL, [SHELL_COMMAND_FLAG, invocation.command], {
        cwd: invocation.workingDirectory,
        env: { ...this.#environment, [PROJECT_DIRECTORY_VARIABLE]: invocation.workingDirectory },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdout = new BoundedText(HOOK_OUTPUT_LIMIT_CHARACTERS);
      const stderr = new BoundedText(HOOK_OUTPUT_LIMIT_CHARACTERS);
      let timedOut = false;
      let drainTimer: NodeJS.Timeout | undefined;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill(KILL_SIGNAL);
        releaseStreams(child);
      }, invocation.timeoutMs);

      child.stdout.setEncoding(OUTPUT_ENCODING).on('data', (chunk: string) => stdout.append(chunk));
      child.stderr.setEncoding(OUTPUT_ENCODING).on('data', (chunk: string) => stderr.append(chunk));
      child.stdin.on('error', ignoreUnreadPayload);
      child.stdin.end(`${JSON.stringify(invocation.payload)}${PAYLOAD_TERMINATOR}`);

      child.once('exit', () => {
        drainTimer = setTimeout(() => releaseStreams(child), STREAM_DRAIN_GRACE_MS);
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        resolve({ exitCode: null, stdout: '', stderr: error.message, timedOut: false });
      });
      child.once('close', (exitCode) => {
        clearTimeout(timer);
        clearTimeout(drainTimer);
        resolve({ exitCode, stdout: stdout.text, stderr: stderr.text, timedOut });
      });
    });
  }
}

function ignoreUnreadPayload(): void {
  return;
}

/** A background process the hook left behind can hold the output open; the hook's own answer is complete once it exits. */
function releaseStreams(child: ChildProcess): void {
  child.stdout?.destroy();
  child.stderr?.destroy();
}
