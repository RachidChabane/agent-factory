import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { GIT_COMMAND_TIMEOUT_MS } from './constants.ts';
import { GitCommandError } from './errors.ts';

export class GitCli {
  private readonly runner: CommandRunner;
  private readonly environment: Readonly<Record<string, string>>;

  constructor(runner: CommandRunner, environment: Readonly<Record<string, string>>) {
    this.runner = runner;
    this.environment = environment;
  }

  runResult(cwd: string, args: readonly string[], extraEnvironment: Readonly<Record<string, string>> = {}): Promise<CommandResult> {
    return this.runner.run(['git', ...args], cwd, GIT_COMMAND_TIMEOUT_MS, { ...this.environment, ...extraEnvironment });
  }

  async run(cwd: string, args: readonly string[], extraEnvironment: Readonly<Record<string, string>> = {}): Promise<string> {
    const result = await this.runResult(cwd, args, extraEnvironment);
    if (result.exitCode !== 0 || result.timedOut) {
      throw new GitCommandError(args, result.exitCode, result.stderr, result.timedOut);
    }
    return result.stdout;
  }

  async runTrimmed(cwd: string, args: readonly string[]): Promise<string> {
    return (await this.run(cwd, args)).trim();
  }
}
