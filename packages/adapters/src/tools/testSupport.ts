import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { CommandSpawnError } from '../process/errors.ts';

export type Answer = Partial<CommandResult> | Error;

export interface AskedCommand {
  readonly command: string;
  readonly timeoutMs: number;
  readonly env: Readonly<Record<string, string>>;
}

export class AnsweringRunner implements CommandRunner {
  readonly asked: AskedCommand[] = [];
  private readonly answers = new Map<string, Answer>();

  answer(command: string, answer: Answer): this {
    this.answers.set(command, answer);
    return this;
  }

  run(command: readonly string[], _cwd: string, timeoutMs: number, env: Readonly<Record<string, string>>): Promise<CommandResult> {
    const key = command.join(' ');
    this.asked.push({ command: key, timeoutMs, env });
    const answer = this.answers.get(key);
    if (answer === undefined) return Promise.reject(new CommandSpawnError(command, Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })));
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', durationMs: 5, timedOut: false, ...answer });
  }
}
