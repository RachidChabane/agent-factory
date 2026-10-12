import type { ChildProcess } from 'node:child_process';
import { signalProcessGroup } from '@agent-factory/plugin';

export const TERMINATION_REASONS = ['exited', 'timeout', 'aborted'] as const;
export type TerminationReason = (typeof TERMINATION_REASONS)[number];

export const ESCALATION_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGKILL'];
const STRAGGLER_SIGNAL: NodeJS.Signals = 'SIGKILL';

export interface SupervisionOptions {
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
  readonly graceMs: number;
}

export interface ProcessExit {
  readonly reason: TerminationReason;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface SupervisedProcess {
  readonly exited: Promise<ProcessExit>;
  terminate(reason: Exclude<TerminationReason, 'exited'>): void;
}

export function superviseProcess(child: ChildProcess, options: SupervisionOptions): SupervisedProcess {
  let reason: TerminationReason = 'exited';
  let escalationTimer: NodeJS.Timeout | undefined;

  const escalate = (step: number): void => {
    const signal = ESCALATION_SIGNALS[step];
    if (signal === undefined) {
      return;
    }
    signalProcessGroup(child.pid, signal);
    escalationTimer = setTimeout(() => escalate(step + 1), options.graceMs);
  };

  const terminate = (requested: Exclude<TerminationReason, 'exited'>): void => {
    if (reason !== 'exited') {
      return;
    }
    reason = requested;
    escalate(0);
  };

  const onAbort = (): void => terminate('aborted');
  const timeoutTimer = setTimeout(() => terminate('timeout'), options.timeoutMs);
  if (options.signal.aborted) {
    onAbort();
  } else {
    options.signal.addEventListener('abort', onAbort, { once: true });
  }

  const release = (): void => {
    clearTimeout(timeoutTimer);
    clearTimeout(escalationTimer);
    options.signal.removeEventListener('abort', onAbort);
  };

  const exited = new Promise<ProcessExit>((resolve, reject) => {
    child.once('error', (error) => {
      release();
      reject(error);
    });
    child.once('exit', () => signalProcessGroup(child.pid, STRAGGLER_SIGNAL));
    child.once('close', (exitCode, signal) => {
      release();
      resolve({ reason, exitCode, signal });
    });
  });

  return { exited, terminate };
}
