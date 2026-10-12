import { resolve } from 'node:path';
import type { Writable } from 'node:stream';
import type { Clock } from '../clock.ts';
import { EXIT_CODES, FakeClaudeError, invalidInvocation, type ExitCode } from '../errors.ts';
import { loadHookConfiguration } from '../hooks/hook-settings-file.ts';
import { ShellHookRunner } from '../hooks/shell-hook-runner.ts';
import { runAgent } from '../run/agent-run.ts';
import { loadScenario } from '../scenario/scenario-file.ts';
import type { Scenario } from '../scenario/scenario.ts';
import { FileSessionStore } from '../session/file-session-store.ts';
import { FileSink, TeeSink, WritableSink, writeText } from '../stream/stream-sink.ts';
import { DEFAULT_MODEL, DEFAULT_PERMISSION_MODE, DEFAULT_TOOLS } from '../stream/stream-vocabulary.ts';
import { isUsageRequest, usageReportLines } from '../usage-report/usage-report.ts';
import { NodeWorkingTree } from '../workspace/node-working-tree.ts';
import { parseCommandLine, toolsOf, type CommandLine } from './command-line.ts';
import { stopHookBlockCapOf } from './stop-hook-cap.ts';

export const PROGRAM_NAME = 'fake-claude';

export interface CliEnvironment {
  readonly argv: readonly string[];
  readonly environment: NodeJS.ProcessEnv;
  readonly workingDirectory: string;
  readonly readStandardInput: () => Promise<string>;
  readonly stdout: Writable;
  readonly stderr: Writable;
  readonly clock: Clock;
}

interface Invocation {
  readonly commandLine: CommandLine;
  readonly scenario: Scenario;
  readonly prompt: string;
  readonly model: string;
  readonly permissionMode: string;
  readonly tools: readonly string[];
}

export async function runCli(cli: CliEnvironment): Promise<ExitCode> {
  try {
    await execute(cli);
    return EXIT_CODES.success;
  } catch (error) {
    return reportFailure(error, cli.stderr);
  }
}

const AUTH_STATUS = ['auth', 'status'] as const;
const AUTH_METHOD = 'claude.ai';
const API_PROVIDER = 'firstParty';

/** Whether the command line asks for `auth status`, the subcommand that reports the login. */
function isAuthStatus(argv: readonly string[]): boolean {
  const start = argv.indexOf(AUTH_STATUS[0]);
  return start !== -1 && argv[start + 1] === AUTH_STATUS[1];
}

async function execute(cli: CliEnvironment): Promise<void> {
  if (isAuthStatus(cli.argv)) {
    await printAuthStatus(cli, parseCommandLine(cli.argv));
    return;
  }
  const invocation = await readInvocation(cli);
  if (isUsageRequest(invocation.prompt)) {
    await printUsageReport(cli, invocation);
  } else {
    await playAgent(cli, invocation);
  }
}

async function readInvocation(cli: CliEnvironment): Promise<Invocation> {
  const commandLine = parseCommandLine(cli.argv);
  const scenario = await loadScenario(commandLine.scenarioPath, cli.workingDirectory);
  return {
    commandLine,
    scenario,
    prompt: commandLine.promptArgument ?? (await cli.readStandardInput()),
    model: commandLine.model ?? DEFAULT_MODEL,
    permissionMode: commandLine.permissionMode ?? DEFAULT_PERMISSION_MODE,
    tools: toolsOf(commandLine.toolList, DEFAULT_TOOLS),
  };
}

/** What `claude auth status` prints for the scenario's login, as one JSON object. */
async function printAuthStatus(cli: CliEnvironment, commandLine: CommandLine): Promise<void> {
  const { account } = await loadScenario(commandLine.scenarioPath, cli.workingDirectory);
  const status = { loggedIn: true, authMethod: AUTH_METHOD, apiProvider: API_PROVIDER, email: account.email, orgName: account.organization, subscriptionType: account.subscriptionType };
  await writeText(cli.stdout, `${JSON.stringify(status)}\n`);
}

async function printUsageReport(cli: CliEnvironment, invocation: Invocation): Promise<void> {
  const stdout = new WritableSink(cli.stdout);
  const lines = usageReportLines({
    usage: invocation.scenario.usage,
    now: cli.clock.now(),
    workingDirectory: cli.workingDirectory,
    tools: invocation.tools,
    model: invocation.model,
    permissionMode: invocation.permissionMode,
  });
  for (const line of lines) {
    await stdout.emit(line);
  }
}

async function playAgent(cli: CliEnvironment, invocation: Invocation): Promise<void> {
  const { commandLine } = invocation;
  const stdout = new WritableSink(cli.stdout);
  await runAgent(
    {
      prompt: invocation.prompt,
      scenario: invocation.scenario,
      hooks: await loadHookConfiguration(commandLine.settings, cli.workingDirectory),
      model: invocation.model,
      permissionMode: invocation.permissionMode,
      effort: commandLine.effort,
      tools: invocation.tools,
      resumeSessionId: commandLine.resumeSessionId,
      stopHookBlockCap: stopHookBlockCapOf(cli.environment),
      workingDirectory: cli.workingDirectory,
    },
    {
      sessions: new FileSessionStore(resolve(cli.workingDirectory, requiredState(commandLine))),
      tree: new NodeWorkingTree(cli.workingDirectory),
      hookRunner: new ShellHookRunner(cli.environment),
      clock: cli.clock,
      streamTo: (transcriptPath) => new TeeSink([stdout, new FileSink(transcriptPath)]),
    },
  );
}

function requiredState(commandLine: CommandLine): string {
  if (commandLine.statePath === null) {
    throw invalidInvocation('--state <directory> is required');
  }
  return commandLine.statePath;
}

async function reportFailure(error: unknown, stderr: Writable): Promise<ExitCode> {
  if (error instanceof FakeClaudeError) {
    await writeText(stderr, `${PROGRAM_NAME}: ${error.message}\n`);
    return error.exitCode;
  }
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await writeText(stderr, `${PROGRAM_NAME}: internal error: ${detail}\n`);
  return EXIT_CODES.internalError;
}
