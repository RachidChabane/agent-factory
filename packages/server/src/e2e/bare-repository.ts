import type { CommandRunner } from '@agent-factory/application';
import { expectThat } from './expectations.ts';
import { joinWords, lastLines } from './format.ts';

const GIT = 'git';
const GIT_TIMEOUT_MS = 30_000;
const GIT_SUCCESS_EXIT_CODE = 0;
const NUL = '\0';
const FAILURE_OUTPUT_LINES = 10;

/** Reads the history and the files of the bare repository behind a local forge, with git. */
export class BareRepository {
  private readonly runner: CommandRunner;
  private readonly path: string;
  private readonly environment: Readonly<Record<string, string>>;

  constructor(runner: CommandRunner, path: string, environment: Readonly<Record<string, string>>) {
    this.runner = runner;
    this.path = path;
    this.environment = environment;
  }

  /** The commit a branch, tag or commit name points at, as its full sha. */
  async revision(ref: string): Promise<string> {
    return (await this.read(['rev-parse', '--verify', `${ref}^{commit}`])).trim();
  }

  /** Every file path of the tree of a commit. */
  async paths(ref: string): Promise<readonly string[]> {
    const listing = await this.read(['ls-tree', '-r', '--name-only', '-z', ref]);
    return listing.split(NUL).filter((path) => path !== '');
  }

  /** The content of a file of a commit, byte for byte. */
  fileAt(ref: string, path: string): Promise<string> {
    return this.read(['show', `${ref}:${path}`]);
  }

  /** The first line of the message of a commit. */
  async subject(ref: string): Promise<string> {
    return (await this.read(['log', '-1', '--format=%s', ref])).trim();
  }

  private async read(args: readonly string[]): Promise<string> {
    const command = [GIT, `--git-dir=${this.path}`, ...args];
    const result = await this.runner.run(command, this.path, GIT_TIMEOUT_MS, this.environment);
    expectThat(
      result.exitCode === GIT_SUCCESS_EXIT_CODE && !result.timedOut,
      `${joinWords(command)} succeeds`,
      `exit code ${GIT_SUCCESS_EXIT_CODE}`,
      `exit code ${result.exitCode}\n${lastLines(result.stderr.trimEnd(), FAILURE_OUTPUT_LINES)}`,
    );
    return result.stdout;
  }
}
