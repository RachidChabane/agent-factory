import { MediaUploadError, renderUploadCommand, uploadedLink, type CommandRunner, type MediaUploader } from '@agent-factory/application';
import { failureOf } from '../process/failureTail.ts';
import { niced } from '../process/niceCommand.ts';
import { CommandSpawnError } from '../process/errors.ts';

const MILLISECONDS_PER_SECOND = 1_000;
export const NO_LINK_REASON = 'the upload command printed no link: its last line must be an http(s) or file address';

export interface CommandMediaUploaderSettings {
  /** The argument template of the operator's upload command; `{file}` stands for the path of the file. */
  readonly command: readonly string[];
  readonly timeoutMs: number;
  /** Where the command runs. */
  readonly workingDirectory: string;
  /** The environment of the operator's session: the upload command runs with it, since it uses the operator's own login. */
  readonly operatorEnvironment: Readonly<Record<string, string | undefined>>;
}

function secondsText(milliseconds: number): string {
  const seconds = Math.round(milliseconds / MILLISECONDS_PER_SECOND);
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

function definedEntries(environment: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(Object.entries(environment).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])));
}

/**
 * Makes a file reachable by running the command the operator declared, outside any sandbox, in the operator's
 * environment, at a low priority and within a time limit. The link is the last line the command prints.
 */
export class CommandMediaUploader implements MediaUploader {
  private readonly runner: CommandRunner;
  private readonly settings: CommandMediaUploaderSettings;

  constructor(runner: CommandRunner, settings: CommandMediaUploaderSettings) {
    this.runner = runner;
    this.settings = settings;
  }

  async upload(path: string): Promise<string> {
    const { command, timeoutMs, workingDirectory, operatorEnvironment } = this.settings;
    const result = await this.run(niced(renderUploadCommand(command, path)), workingDirectory, timeoutMs, definedEntries(operatorEnvironment));
    if (result.timedOut) throw new MediaUploadError(`the upload command did not finish within ${secondsText(timeoutMs)} and was stopped`);
    if (result.exitCode !== 0) throw new MediaUploadError(`the upload command exited with ${result.exitCode}: ${failureOf(result)}`);
    const link = uploadedLink(result.stdout);
    if (link === null) throw new MediaUploadError(NO_LINK_REASON);
    return link;
  }

  private async run(command: readonly string[], workingDirectory: string, timeoutMs: number, environment: Record<string, string>) {
    try {
      return await this.runner.run(command, workingDirectory, timeoutMs, environment);
    } catch (error) {
      if (error instanceof CommandSpawnError) throw new MediaUploadError(`the upload command could not be started: ${error.message}`);
      throw error;
    }
  }
}
