import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { scanForSecrets, textDocument, type ToolName, type ToolProbeResult, type ToolStatus } from '@agent-factory/domain';
import { isMissingExecutable } from '../process/errors.ts';

export const CREDENTIAL_WITHHELD_DETAIL = 'output withheld: it looks like a credential';

const EXIT_CODE_SUCCESS = 0;
const NEWLINE = '\n';
const VERSION_PATTERN = /\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?/;
const MAX_DETAIL_CHARACTERS = 300;
const MILLISECONDS_PER_SECOND = 1_000;
const OUTPUT_ORIGIN = 'tool output';

export interface Reading {
  readonly status: ToolStatus;
  readonly detail: string;
}

export interface ProbeStrategy {
  readonly tool: ToolName;
  readonly loginCommand: string | null;
  readonly installCommand: string | null;
  readonly command: readonly string[];
  readonly versionCommand: readonly string[] | null;
  readonly environment: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  interpret(result: CommandResult): Reading;
}

export function firstLine(text: string): string {
  const line = text.split(NEWLINE).map((entry) => entry.trim()).find((entry) => entry !== '') ?? '';
  return line.length > MAX_DETAIL_CHARACTERS ? `${line.slice(0, MAX_DETAIL_CHARACTERS)}…` : line;
}

export function outputOf(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`;
}

export function succeeded(result: CommandResult): boolean {
  return result.exitCode === EXIT_CODE_SUCCESS && !result.timedOut;
}

export function exitReading(result: CommandResult, connected: string, refused: ToolStatus = 'unauthenticated'): Reading {
  return succeeded(result) ? { status: 'connected', detail: firstLine(outputOf(result)) || connected } : { status: refused, detail: firstLine(outputOf(result)) };
}

function versionOf(result: CommandResult): string | null {
  return VERSION_PATTERN.exec(outputOf(result))?.[0] ?? null;
}

function withoutCredentials(detail: string): string {
  return scanForSecrets([textDocument(OUTPUT_ORIGIN, detail)], []).length > 0 ? CREDENTIAL_WITHHELD_DETAIL : detail;
}

export class ToolProbeEngine {
  private readonly runner: CommandRunner;
  private readonly workingDirectory: string;

  constructor(runner: CommandRunner, workingDirectory: string) {
    this.runner = runner;
    this.workingDirectory = workingDirectory;
  }

  async probe(strategy: ProbeStrategy): Promise<ToolProbeResult> {
    const { tool, command } = strategy;
    let result: CommandResult;
    try {
      result = await this.runner.run(command, this.workingDirectory, strategy.timeoutMs, strategy.environment);
    } catch (error) {
      return isMissingExecutable(error)
        ? { tool, status: 'missing', version: null, detail: `${command[0] ?? tool} is not installed or not on the PATH`, fixCommand: strategy.installCommand }
        : { tool, status: 'error', version: null, detail: error instanceof Error ? error.message : String(error), fixCommand: null };
    }
    if (result.timedOut) {
      return {
        tool,
        status: 'unauthenticated',
        version: await this.version(strategy),
        detail: `${command.join(' ')} did not answer within ${Math.round(strategy.timeoutMs / MILLISECONDS_PER_SECOND)} s; it is probably waiting for a login`,
        fixCommand: strategy.loginCommand,
      };
    }
    const reading = strategy.interpret(result);
    return {
      tool,
      status: reading.status,
      version: await this.version(strategy),
      detail: withoutCredentials(reading.detail),
      fixCommand: reading.status === 'connected' ? null : strategy.loginCommand,
    };
  }

  private async version(strategy: ProbeStrategy): Promise<string | null> {
    if (strategy.versionCommand === null) return null;
    try {
      const result = await this.runner.run(strategy.versionCommand, this.workingDirectory, strategy.timeoutMs, strategy.environment);
      return succeeded(result) ? versionOf(result) : null;
    } catch {
      return null;
    }
  }
}
