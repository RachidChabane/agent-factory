import { spawn } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { concretePaths, parsePathPattern } from '../sandbox/path-patterns.ts';
import type { Readable } from 'node:stream';
import type { AgentHarness, AgentRunEvent, AgentRunRequest, AgentRunResult } from '@agent-factory/application';
import type { TokenUsage } from '@agent-factory/domain';
import { BoundedTail, GatePolicySchema, isWithin, parseGateDecisionLog, type GateDecision } from '@agent-factory/plugin';
import { buildChildEnvironment, credentialVariablesIn, type ChildEnvironment } from './child-environment.ts';
import { buildClaudeArguments } from './claude-invocation.ts';
import { launchCommand, type ClaudeHarnessConfig } from './claude-harness-config.ts';
import { referencePromptSection, type ReferenceMount } from './reference-access.ts';
import { superviseProcess, type TerminationReason } from './process-supervisor.ts';
import { decideOutcome, gateBlocksOf, type StopHookResponse } from './run-outcome.ts';
import { ROLE_PERMISSIONS } from './role-permissions.ts';
import { renderRunSettings, type RenderedRunSettings } from './run-settings.ts';
import { appendedSystemPrompt } from './shell-policy-prompt.ts';
import {
  changedFiles,
  createRunWorkspace,
  resolveIsolationLayout,
  writeRunFile,
  writeRunJson,
  type FileFingerprint,
  type IsolationLayout,
  type RunWorkspace,
} from './run-workspace.ts';
import { RunTranscript } from './stream/run-transcript.ts';
import type { ResultLine } from './stream/stream-schemas.ts';

const LOG_FILE_MODE = 0o600;
/** The platform whose sandbox opens either every Unix socket or none. */
const LINUX_PLATFORM = 'linux';
export const DEFAULT_CLAUDE_CONFIG_DIRECTORY = '.claude';
export const SHELL_SNAPSHOTS_DIRECTORY = 'shell-snapshots';
const EXCLUSIVE_CREATE = 'wx';
const STDERR_TAIL_LIMITS = { maxLines: 200, maxCharacters: 64 * 1024 };
const DRAIN_EVENT = 'drain';
const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

interface PreparedRun {
  readonly rendered: RenderedRunSettings;
  readonly fingerprints: readonly FileFingerprint[];
  readonly gateRequired: boolean;
  /** The snapshots this run may read, opened as directories of the session so that the file tools reach them. */
  readonly references: readonly ReferenceMount[];
}

export class UnknownClaudeAccountError extends Error {
  constructor(account: string, known: readonly string[]) {
    super(`No Claude account named ${account} is configured (known: ${known.length === 0 ? 'none' : known.join(', ')})`);
    this.name = 'UnknownClaudeAccountError';
  }
}

export class ClaudeCodeHarness implements AgentHarness {
  readonly #config: ClaudeHarnessConfig;

  constructor(config: ClaudeHarnessConfig) {
    this.#config = config;
  }

  async run(
    request: AgentRunRequest,
    onEvent: (event: AgentRunEvent) => void,
    signal: AbortSignal,
  ): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const layout = await resolveIsolationLayout(
      request.workingDirectory,
      this.#config.runsDirectory,
      this.#config.factoryInstallDirectory,
      this.#config.protectedDirectories,
      this.#config.writableDirectories,
    );
    const workspace = await createRunWorkspace(layout.runsRoot, request.runId);
    const prepared = await this.#prepare(request, layout, workspace);
    const environment = this.#environment(workspace, request.account);
    const [executable, ...launchPrefix] = launchCommand(this.#config);
    if (executable === undefined) {
      throw new Error('the claude launch command is empty');
    }
    const streamLog = createWriteStream(workspace.streamLogPath, { flags: EXCLUSIVE_CREATE, mode: LOG_FILE_MODE });
    const stderrLog = createWriteStream(workspace.stderrLogPath, { flags: EXCLUSIVE_CREATE, mode: LOG_FILE_MODE });
    const stderrTail = new BoundedTail(STDERR_TAIL_LIMITS);

    const child = spawn(
      executable,
      [
        ...launchPrefix,
        ...buildClaudeArguments(
          request,
          {
            settingsPath: workspace.settingsPath,
            mcpConfigPath: workspace.mcpConfigPath,
            appendSystemPromptPath: workspace.appendSystemPromptPath,
          },
          prepared.rendered,
          prepared.references.map((mount) => mount.path),
        ),
      ],
      { cwd: layout.worktree, env: environment, stdio: ['pipe', 'pipe', 'pipe'], detached: true },
    );
    const supervised = superviseProcess(child, {
      timeoutMs: request.timeoutMs,
      signal,
      graceMs: this.#config.terminationGraceMs,
    });
    const transcript = new RunTranscript(this.#config.maxLineBytes, onEvent, () => supervised.terminate('aborted'));
    pipeWithBackpressure(child.stdout, streamLog, (chunk) => transcript.push(chunk));
    pipeWithBackpressure(child.stderr, stderrLog, (chunk) => stderrTail.append(chunk.toString('utf8')));
    child.stdin.on('error', ignoreClosedInput);
    child.stdin.end(request.prompt);

    try {
      const exit = await supervised.exited;
      transcript.end();
      if (transcript.listenerError !== null) {
        throw transcript.listenerError;
      }
      return await this.#conclude(request, workspace, prepared, transcript.result, {
        termination: exit.reason,
        stopHookResponses: transcript.stopHookResponses,
        sessionId: transcript.sessionId,
        finalText: transcript.result?.result ?? transcript.lastAssistantText ?? stderrTail.text().trim(),
        elapsedMs: Date.now() - startedAt,
      });
    } finally {
      await Promise.all([finish(streamLog), finish(stderrLog)]);
    }
  }

  async #prepare(request: AgentRunRequest, layout: IsolationLayout, workspace: RunWorkspace): Promise<PreparedRun> {
    const gateRequired = request.gateCommand !== null || request.frozenChecks.length > 0;
    const policy = GatePolicySchema.parse({
      worktree: layout.worktree,
      frozenChecks: request.frozenChecks,
      gateCommand: request.gateCommand,
      gateTimeoutMs: this.#config.gateTimeoutMs,
      decisionLogPath: workspace.gateDecisionLogPath,
      decisionRequestFile: request.decisionRequestPath === null ? null : join(layout.worktree, request.decisionRequestPath),
    });
    const references = await this.#config.references();
    const rendered = renderRunSettings({
      role: request.role,
      extraAllowedTools: request.allowedTools,
      worktree: layout.worktree,
      frozenCheckPaths: request.frozenChecks.map((check) => check.path),
      protectedDirectories: layout.protectedDirectories,
      hookRuntime: this.#config.hookRuntime,
      hookScripts: this.#config.hookScripts,
      policyPath: workspace.gatePolicyPath,
      gateRequired,
      gateTimeoutMs: this.#config.gateTimeoutMs,
      sandboxAllowedDomains: this.#config.sandboxAllowedDomains,
      shellCommands: this.#config.shellCommands,
      unixSockets: this.#config.engineSockets(),
      socketsAllOrNothing: this.#config.platform === LINUX_PLATFORM,
      references,
      writableDirectories: layout.writableDirectories,
      deniedReadPaths: this.#deniedReadPaths(layout.worktree),
      readablePaths: [join(this.#claudeConfigDirectory(request.account) ?? join(this.#config.home, DEFAULT_CLAUDE_CONFIG_DIRECTORY), SHELL_SNAPSHOTS_DIRECTORY)],
    });
    const fingerprints = await Promise.all([
      writeRunJson(workspace.gatePolicyPath, policy),
      writeRunJson(workspace.settingsPath, rendered.settings),
      writeRunJson(workspace.mcpConfigPath, { mcpServers: request.mcpServers }),
      writeRunFile(
        workspace.appendSystemPromptPath,
        appendedSystemPrompt(request.appendSystemPrompt, rendered.allowedTools, referencePromptSection(references, ROLE_PERMISSIONS[request.role].copiesReferences)),
      ),
    ]);
    return { rendered, fingerprints, gateRequired, references };
  }

  #environment(workspace: RunWorkspace, account: string | null): ChildEnvironment {
    const environment = buildChildEnvironment(this.#config.sourceEnvironment, {
      toolEnvironment: this.#config.toolEnvironment,
      githubConfigDirectory: workspace.githubConfigDirectory,
      claudeConfigDirectory: this.#claudeConfigDirectory(account),
      maxSubagentSpawnDepth: this.#config.maxSubagentSpawnDepth,
      maxConcurrentSubagents: this.#config.maxConcurrentSubagents,
      stopHookBlockCap: this.#config.inSessionCorrections,
    });
    const leaked = credentialVariablesIn(environment);
    if (leaked.length > 0) {
      throw new Error(`refusing to start claude with credential variables: ${leaked.join(', ')}`);
    }
    return environment;
  }

  #deniedReadPaths(worktree: string): readonly string[] {
    const patterns = [...this.#config.deniedReadPaths, ...Object.values(this.#config.accounts)].map((pattern) => parsePathPattern(pattern, this.#config.home));
    const paths = concretePaths(patterns);
    const enclosing = paths.find((path) => isWithin(path, worktree));
    if (enclosing !== undefined) throw new Error(`the worktree ${worktree} lies inside the credential path ${enclosing} that agent runs may not read`);
    return paths;
  }

  #claudeConfigDirectory(account: string | null): string | null {
    if (account === null) return null;
    const directory = this.#config.accounts[account];
    if (directory === undefined) throw new UnknownClaudeAccountError(account, Object.keys(this.#config.accounts));
    return directory;
  }

  async #conclude(
    request: AgentRunRequest,
    workspace: RunWorkspace,
    prepared: PreparedRun,
    result: ResultLine | null,
    observed: {
      readonly termination: TerminationReason;
      readonly stopHookResponses: readonly StopHookResponse[];
      readonly sessionId: string | null;
      readonly finalText: string;
      readonly elapsedMs: number;
    },
  ): Promise<AgentRunResult> {
    const decisions = await gateDecisions(workspace.gateDecisionLogPath);
    const outcome = decideOutcome({
      termination: observed.termination,
      result,
      gateRequired: prepared.gateRequired,
      gate: {
        decisions,
        stopHookResponses: observed.stopHookResponses,
      },
      tamperedRunFiles: await changedFiles(prepared.fingerprints),
    });
    return {
      runId: request.runId,
      sessionId: observed.sessionId,
      outcome,
      finalText: observed.finalText,
      costUsd: result?.total_cost_usd ?? 0,
      usage: usageOf(result),
      durationMs: result?.duration_ms ?? observed.elapsedMs,
      turns: result?.num_turns ?? 0,
      gateBlocks: gateBlocksOf(decisions),
      rawLogPath: workspace.streamLogPath,
    };
  }
}

function pipeWithBackpressure(source: Readable, log: WriteStream, observe: (chunk: Buffer) => void): void {
  source.on('data', (chunk: Buffer) => {
    observe(chunk);
    if (!log.write(chunk)) {
      source.pause();
      log.once(DRAIN_EVENT, () => source.resume());
    }
  });
}

function ignoreClosedInput(): void {
  return;
}

function finish(stream: WriteStream): Promise<void> {
  return new Promise((resolve) => {
    if (stream.writableFinished) {
      resolve();
      return;
    }
    stream.end(() => resolve());
  });
}

async function gateDecisions(decisionLogPath: string): Promise<readonly GateDecision[]> {
  try {
    return parseGateDecisionLog(await readFile(decisionLogPath, 'utf8'));
  } catch {
    return [];
  }
}

function usageOf(result: ResultLine | null): TokenUsage {
  if (result?.usage === undefined) {
    return ZERO_USAGE;
  }
  return {
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
    cacheReadTokens: result.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: result.usage.cache_creation_input_tokens ?? 0,
  };
}
