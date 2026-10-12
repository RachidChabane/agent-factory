import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';

const POLL_MS = 100;
const STOP_GRACE_MS = 30_000;
const SELF_EXIT_GRACE_MS = 15_000;

export interface ProcessSpec {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The file every line the process prints is also written to, for the report of a failed run. */
  readonly logFile: string;
  /** What the process prints once it has begun to stop by itself; it is then given time to exit before it is told to. */
  readonly stoppingLine?: RegExp;
}

export interface ProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

/** A child process whose output is kept in memory and in a log file, and that stops with SIGTERM. */
export class ManagedProcess {
  private readonly child: ChildProcess;
  private readonly log: WriteStream;
  private readonly stoppingLine: RegExp | undefined;
  private text = '';
  private exit: ProcessExit | null = null;
  readonly exited: Promise<ProcessExit>;

  constructor(spec: ProcessSpec) {
    mkdirSync(dirname(spec.logFile), { recursive: true });
    this.log = createWriteStream(spec.logFile);
    this.stoppingLine = spec.stoppingLine;
    const [program, ...args] = spec.command;
    if (program === undefined) throw new Error('a process needs a command');
    this.child = spawn(program, args, { cwd: spec.cwd, env: { ...spec.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = (chunk: Buffer): void => {
      const piece = chunk.toString('utf8');
      this.text += piece;
      this.log.write(piece);
    };
    this.child.stdout?.on('data', collect);
    this.child.stderr?.on('data', collect);
    this.exited = new Promise((resolve) => {
      this.child.once('exit', (code, signal) => {
        this.exit = { code, signal };
        this.log.end();
        resolve(this.exit);
      });
    });
  }

  get output(): string {
    return this.text;
  }

  get hasExited(): boolean {
    return this.exit !== null;
  }

  /** Resolves with the first match of the pattern in the output; rejects when the process exits first or the time runs out. */
  async waitForOutput(pattern: RegExp, description: string, timeoutMs: number): Promise<RegExpMatchArray> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const match = pattern.exec(this.text);
      if (match !== null) return match;
      if (this.exit !== null) throw new Error(`the process exited (${describeExit(this.exit)}) before ${description}:\n${this.tail()}`);
      if (Date.now() > deadline) throw new Error(`gave up waiting ${timeoutMs} ms for ${description}:\n${this.tail()}`);
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  tail(lines = 25): string {
    return this.text.split('\n').slice(-lines).join('\n');
  }

  /** Sends SIGTERM and waits for the exit; a process that ignores it is killed after the grace period. A process already stopping by itself is left to finish. */
  async stop(): Promise<ProcessExit> {
    if (this.exit !== null) return this.exit;
    if (this.stoppingLine?.test(this.text) === true) await this.waitForExit(SELF_EXIT_GRACE_MS);
    if (this.exit !== null) return this.exit;
    this.child.kill('SIGTERM');
    const timer = setTimeout(() => this.child.kill('SIGKILL'), STOP_GRACE_MS);
    try {
      return await this.exited;
    } finally {
      clearTimeout(timer);
    }
  }

  private async waitForExit(timeoutMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    try {
      await Promise.race([this.exited, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function describeExit(exit: ProcessExit): string {
  return exit.signal === null ? `exit code ${exit.code}` : `signal ${exit.signal}`;
}
