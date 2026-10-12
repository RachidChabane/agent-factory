import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { DEFAULT_KILL_GRACE_MS, DEFAULT_MAX_OUTPUT_BYTES, FALLBACK_SIGNAL_NUMBER, SIGNAL_EXIT_CODE_BASE } from './constants.ts';
import { CommandAbortedError, CommandSpawnError, EmptyCommandError } from './errors.ts';
import { TailBuffer } from './tailBuffer.ts';

export interface SpawnCommandRunnerOptions {
  readonly maxOutputBytes?: number;
  readonly killGraceMs?: number;
  readonly abortSignal?: AbortSignal;
}

const ABORT_EVENT = 'abort';

export class SpawnCommandRunner implements CommandRunner {
  private readonly maxOutputBytes: number;
  private readonly killGraceMs: number;
  private readonly abortSignal: AbortSignal | null;

  constructor(options: SpawnCommandRunnerOptions = {}) {
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    this.killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    this.abortSignal = options.abortSignal ?? null;
  }

  run(
    command: readonly string[],
    cwd: string,
    timeoutMs: number,
    env: Readonly<Record<string, string>>,
  ): Promise<CommandResult> {
    const [executable, ...args] = command;
    if (executable === undefined) return Promise.reject(new EmptyCommandError());
    if (this.abortSignal?.aborted === true) return Promise.reject(new CommandAbortedError(command));

    return new Promise<CommandResult>((resolve, reject) => {
      const startedAt = performance.now();
      const stdout = new TailBuffer(this.maxOutputBytes);
      const stderr = new TailBuffer(this.maxOutputBytes);
      let timedOut = false;
      let aborted = false;
      let killTimer: NodeJS.Timeout | undefined;

      const child = spawn(executable, args, {
        cwd,
        env: { ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });
      const signalGroup = (signal: NodeJS.Signals): void => {
        try {
          if (child.pid !== undefined) process.kill(-child.pid, signal);
        } catch {
          child.kill(signal);
        }
      };

      const stop = (): void => {
        signalGroup('SIGTERM');
        killTimer = setTimeout(() => signalGroup('SIGKILL'), this.killGraceMs);
      };
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        stop();
      }, timeoutMs);
      const onAbort = (): void => {
        aborted = true;
        clearTimeout(timeoutTimer);
        stop();
      };
      this.abortSignal?.addEventListener(ABORT_EVENT, onAbort, { once: true });
      const release = (): void => {
        clearTimeout(timeoutTimer);
        clearTimeout(killTimer);
        this.abortSignal?.removeEventListener(ABORT_EVENT, onAbort);
      };

      child.stdout.on('data', (chunk: Buffer) => stdout.append(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.append(chunk));
      child.on('error', (error) => {
        release();
        reject(new CommandSpawnError(command, error));
      });
      child.on('close', (code, signal) => {
        release();
        if (timedOut || aborted) signalGroup('SIGKILL');
        if (aborted) {
          reject(new CommandAbortedError(command));
          return;
        }
        const signalNumber = signal === null ? FALLBACK_SIGNAL_NUMBER : (constants.signals[signal] ?? FALLBACK_SIGNAL_NUMBER);
        resolve({
          exitCode: code ?? SIGNAL_EXIT_CODE_BASE + signalNumber,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          durationMs: Math.round(performance.now() - startedAt),
          timedOut,
        });
      });
    });
  }
}
