import type { CommandResult, CommandRunner, ToolProber } from '@agent-factory/application';
import { isBuiltInTool, type ToolName, type ToolProbeResult } from '@agent-factory/domain';
import { InvalidToolDeclarationError } from './errors.ts';
import { firstLine, outputOf, succeeded, ToolProbeEngine, type ProbeStrategy, type Reading } from './tool-probe-engine.ts';

export interface DeclaredTool {
  readonly name: string;
  readonly description: string;
  readonly check: readonly string[];
  readonly version: readonly string[] | null;
  readonly connectedPattern: string | null;
  readonly fix: string | null;
  readonly install: string | null;
  readonly timeoutMs: number;
}

export interface DeclarativeToolProbeSettings {
  readonly tools: readonly DeclaredTool[];
  readonly environment: Readonly<Record<string, string>>;
  readonly workingDirectory: string;
}

const NO_OUTPUT_DETAIL = 'the check succeeded';

function compiledPattern(tool: DeclaredTool): RegExp | null {
  if (tool.connectedPattern === null) return null;
  try {
    return new RegExp(tool.connectedPattern);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new InvalidToolDeclarationError(tool.name, `connectedPattern ${JSON.stringify(tool.connectedPattern)} is not a valid regular expression: ${reason}`);
  }
}

function assertProbeable(tool: DeclaredTool, declared: ReadonlyMap<ToolName, ProbeStrategy>): void {
  if (isBuiltInTool(tool.name)) throw new InvalidToolDeclarationError(tool.name, 'its name is reserved for a built-in tool');
  if (declared.has(tool.name)) throw new InvalidToolDeclarationError(tool.name, 'it is declared twice');
  if (tool.check.length === 0) throw new InvalidToolDeclarationError(tool.name, 'its check command is empty');
  if (!Number.isFinite(tool.timeoutMs) || tool.timeoutMs <= 0) throw new InvalidToolDeclarationError(tool.name, 'its timeout must be a positive number of milliseconds');
}

function readingOf(result: CommandResult, pattern: RegExp | null): Reading {
  const line = firstLine(outputOf(result));
  if (!succeeded(result)) return { status: 'unauthenticated', detail: line || `exit code ${result.exitCode}` };
  if (pattern !== null && !pattern.test(outputOf(result))) return { status: 'unauthenticated', detail: line || `the output does not match ${pattern.source}` };
  return { status: 'connected', detail: line || NO_OUTPUT_DETAIL };
}

function strategyOf(tool: DeclaredTool, environment: Readonly<Record<string, string>>): ProbeStrategy {
  const pattern = compiledPattern(tool);
  return {
    tool: tool.name,
    loginCommand: tool.fix,
    installCommand: tool.install,
    command: tool.check,
    versionCommand: tool.version,
    environment,
    timeoutMs: tool.timeoutMs,
    interpret: (result) => readingOf(result, pattern),
  };
}

export class DeclarativeToolProber implements ToolProber {
  private readonly engine: ToolProbeEngine;
  private readonly strategies: ReadonlyMap<ToolName, ProbeStrategy>;

  constructor(runner: CommandRunner, settings: DeclarativeToolProbeSettings) {
    this.engine = new ToolProbeEngine(runner, settings.workingDirectory);
    const strategies = new Map<ToolName, ProbeStrategy>();
    for (const tool of settings.tools) {
      assertProbeable(tool, strategies);
      strategies.set(tool.name, strategyOf(tool, settings.environment));
    }
    this.strategies = strategies;
  }

  async probe(tool: ToolName): Promise<ToolProbeResult> {
    const strategy = this.strategies.get(tool);
    if (strategy === undefined) return { tool, status: 'error', version: null, detail: `no tool named ${tool} is configured`, fixCommand: null };
    return this.engine.probe(strategy);
  }
}
